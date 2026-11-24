# SuperNotes

## Overview

This application is an AI-powered exam-cramming engine designed specifically for college undergraduates to eliminate the chaotic, last-minute panic of studying across fragmented platforms. By pairing frictionless intake—capturing WhatsApp forwards and camera snaps via the native OS share sheet alongside automated Google Drive and Classroom sync—with an intelligent multimodal ingestion pipeline, it extracts messy handwriting, slide decks, and complex LaTeX math into a unified, auto-categorized repository. It directly solves the pain of manual pre-exam searching and generic AI hallucinations by using hierarchical, parent-document RAG with strict citation grounding, delivering high-yield cheat sheets, past-paper solutions, and active-recall quizzes tied directly to the student’s actual course materials

## Goals

1. Let authenticated users add and use the application
2. let users share the notes and the ai chats
3. the user prompt the chat and the ai provides the answers with the reference to the particular notes
4. Let user upload their notes be it pdf,word or any photo format
5. let users sync their google drive and classroom and upload notes from their
6. The system automatically classifies the notes into subjects and let users know as the final check
7. User can also manully create folder and upload it there

## Core User Flow

1. User signs in
2. User uploads notes from gallary and downloaded pdfs from local
3. User sync their Google drive and classroom and selects the notes to upload from the folders
4. User Prompt the Ai a question and it answers ,with a link to the notes and highlights the text from the original notes
5. User uploads an image(a PYQ) in the AI chat and prompt the AI for answers
6. User can see and check the organized uploaded notes(pdf,word,images) from the folders created in the app

## Features

### Frictionless Ingestion

- Ingest files directly from phone using device native share
- One-time OAuth linking to google classroom and google drive
- BatchCamera and gallery import option

### Multimodal OCR & Latex Reconstruction

- Cost-aware routing for notes,Digital PDFs in PyMuPDF and handwritten reserved for multimodal processing
- Image Cleaning & Pre processing using OpenCV
- Formula and Hierarchy rxtraction

### Interactive citation grounding and split screen viewer

- Click to source verification
- Visual bounding box highlighting

### Hierarchical,Hallucination-Free RAG engine

- Hybrid search with cross encoder reranking
- Context RAG

### AI assisted studying and exam ready study workflows

- High Yield 1 page cheat sheets
- Dynamic active recall quizzing

## Scope

### In Scope

- Frictionless Ingestion
- Cost-Optimized Multimodal OCR
- Academic Hierarchy & Math Formatting
- Hierarchical Parent-Document RAG
- Strict Citation Grounding
- Auto-Categorization of the notes

### Out of Scope

- Custom lms automation and direct whatsapp chat scrapping
- Headless browser scrapers (Selenium/Puppeteer) requiring student credentials for CAPTCHA/2FA-gated university ERP or Moodle portals.
- Rich-text collaborative WYSIWYG document editing (not building a Notion, Obsidian, or Google Docs replacement).
- Graduate/PhD multi-paper literature review matrices, citation graphs, or external academic database integrations (arXiv, PubMed, Zotero).
- Real-time classroom lecture audio recording or live video transcription.
- Open-domain web search fallback when an answer is missing from uploaded student notes.

## Success Criteria

1. A signed-in student can share a multi-page WhatsApp PDF or 5 handwritten notebook photos via the share sheet and see them auto-categorized under the correct subject within 15 seconds.
2. Native digital PDFs are parsed with zero external Vision API calls, while handwritten math pages render valid laTeX equations (`$...$` and `$$...$$`) without garbled ASCII.
3. Every factual claim or formula in a generated cheat sheet or PYQ answer includes a clickable citation badge that scrolls the split-screen viewer to the exact source page and bounding box.
4. Queries asking about topics absent from the uploaded notes return an explicit "Not covered in your uploaded notes" response in Notes-only mode; in the default Hybrid mode, uncovered parts are answered from general knowledge and clearly labeled as such.
