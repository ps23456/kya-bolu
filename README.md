# Kya Bolu?

Never leave anyone on read. Or do — stylishly.

Kya Bolu? is a Vite + React + TypeScript single-page app that accepts a chat screenshot or pasted conversation text, sends it to `/api/reply`, and returns three copy-ready reply options.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env
```

3. Edit `.env` and set:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

4. Start the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:5173
```

## Scripts

```bash
npm run dev      # Express API + Vite dev server
npm run build    # TypeScript check + production build
npm run lint     # Oxlint
npm start        # Serve the production build through Express
```

## API

`POST /api/reply`

Accepts multipart form data:

- `image`: optional chat screenshot image
- `text`: optional pasted conversation text

At least one of `image` or `text` is required.

Returns:

```json
{
  "language": "Hinglish",
  "situation_read": "A short read of the chat context.",
  "replies": [
    { "tone": "Warm", "text": "..." },
    { "tone": "Playful", "text": "..." },
    { "tone": "Low-key", "text": "..." }
  ]
}
```
