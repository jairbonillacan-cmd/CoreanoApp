const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files if we want to host everything from one server
// Uncomment for production:
// app.use(express.static(path.join(__dirname, '../frontend')));

// Load Data
const loadJson = (filename) => {
    const filePath = path.join(__dirname, 'data', filename);
    return JSON5.parse(fs.readFileSync(filePath, 'utf8'));
};

const lessons = loadJson('lessons.json');
const vocabulary = loadJson('vocabulary.json');
const curriculum = loadJson('curriculum.json');
const jamoStrokes = loadJson('jamo_strokes.json');

// API Endpoints
app.get('/api/lessons', (req, res) => res.json(lessons));
app.get('/api/lessons/:id', (req, res) => {
    const lesson = lessons.find(l => l.id == req.params.id);
    lesson ? res.json(lesson) : res.status(404).json({ error: 'Lesson not found' });
});

app.get('/api/vocabulary', (req, res) => res.json(vocabulary));
app.get('/api/curriculum', (req, res) => res.json(curriculum));
app.get('/api/jamo-strokes', (req, res) => res.json(jamoStrokes));

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'CoreanoApp Backend is running' }));

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
