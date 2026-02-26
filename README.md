# Personal Website — Front-end

[Visit Site](https://breddlane.com)

This repository contains the **front-end** of a **custom single-page application (SPA)** built with **vanilla JavaScript**, featuring **routing** and **state management**. Fully responsive with **smooth animations** and a **custom UI/UX** across desktop and touch devices. It includes an **image gallery**, a **code viewer**, and an **AI chat** (requires the [back-end](#back-end-note) to function).

To run the front-end locally, see the [Running Locally](#running-locally) section below.

## Features

- SPA routing for smooth navigation
- State management for dynamic content
- Responsive design for desktop and touch devices
- Smooth animations and interactive UI
- Multi-language support: English, Russian
- Image gallery
- Code viewer
- AI chat interface with context retention

## Running Locally

This repository includes a minimal **Node.js server** (`frontend-server.js`) to serve the front-end locally. To run:

1. Install [Node.js](https://nodejs.org/).
2. Clone this repository:
```bash
git clone https://github.com/breddlane/personal-website-frontend.git
cd personal-website-frontend
```
3. Install dependencies:
```bash
npm install
```
4. Start the server:
```bash
npm start
```
5. Open your browser at http://localhost:3000.

## Back-end Note

The AI chat, session logging, and token usage tracking are handled by a **custom Node.js back-end with SQLite**, which is **not included** in this repository.

**Back-end functionality includes:**

- User identification via UID and fingerprinting
- AI chat via OpenAI GPT API
- Chat history storage
- Daily token limits per user
- Security and rate limiting

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js (minimal server for local front-end)

## Project Link

View this project on my personal website: [Personal Website](https://breddlane.com/projects/personal-website)