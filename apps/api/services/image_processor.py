"""
OpenCV Image Preprocessing Service.

Prepares handwritten notebook photos, camera snaps, and low-contrast scans
before multimodal vision OCR.

Operations:
  1. Grayscale conversion.
  2. Background illumination / shadow normalization.
  3. Deskewing (angle correction) using minAreaRect.
  4. Adaptive thresholding / mild sharpening to enhance ink strokes.
"""

import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger("supernotes.image_processor")


class ImageProcessor:
    def clean_image_for_ocr(self, input_path: Path, output_path: Path | None = None) -> Path:
        """
        Preprocess a photo of handwritten notes or scanned page for high-accuracy OCR.

        Returns the path to the cleaned image (or original path if processing fails).
        """
        if not input_path.exists():
            return input_path

        dest_path = output_path or input_path.with_name(f"{input_path.stem}_cleaned.png")

        try:
            # 1. Load image in color
            img = cv2.imread(str(input_path))
            if img is None:
                logger.warning(f"OpenCV could not load {input_path}, using original.")
                return input_path

            # 2. Convert to grayscale
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # 3. Deskew orientation if angle is detectable
            deskewed = self._deskew(gray)

            # 4. Remove shadows & normalize illumination
            # Dilate background to estimate non-uniform lighting from phone cameras
            dilated = cv2.dilate(deskewed, np.ones((7, 7), np.uint8))
            bg_blur = cv2.medianBlur(dilated, 21)
            diff = 255 - cv2.absdiff(deskewed, bg_blur)
            norm = cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)

            # 5. Mild sharpening to reinforce faint pencil/pen strokes
            kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
            sharpened = cv2.filter2D(norm, -1, kernel)

            # 6. Blend sharpened with normalized image for balanced contrast
            cleaned = cv2.addWeighted(norm, 0.75, sharpened, 0.25, 0)

            # Save cleaned image
            cv2.imwrite(str(dest_path), cleaned)
            logger.info(f"OpenCV preprocessing complete: {dest_path.name}")
            return dest_path

        except Exception as err:
            logger.warning(
                f"OpenCV preprocessing encountered error ({err}); falling back to source image."
            )
            return input_path

    def _deskew(self, image: np.ndarray) -> np.ndarray:
        """Estimate text skew angle and rotate to align horizontally."""
        try:
            # Invert for contour analysis
            thresh = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
            coords = np.column_stack(np.where(thresh > 0))

            if coords.shape[0] < 50:
                return image  # too few features to safely estimate angle

            angle = cv2.minAreaRect(coords)[-1]

            # minAreaRect returns angle in [-90, 0)
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle

            # Only rotate if skew is noticeable (> 0.5 deg and < 35 deg)
            if 0.5 < abs(angle) < 35.0:
                (h, w) = image.shape[:2]
                center = (w // 2, h // 2)
                m = cv2.getRotationMatrix2D(center, angle, 1.0)
                rotated = cv2.warpAffine(
                    image, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
                )
                return rotated

            return image
        except Exception:
            return image


image_processor = ImageProcessor()
