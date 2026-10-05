const { createApp, ref, computed, onMounted, nextTick } = Vue;

const API_BASE = 'http://localhost:3000/api';

createApp({
    setup() {
        // State
        const isAppLoading = ref(true);
        const currentView = ref('path');
        const searchQuery = ref('');
        const isDarkMode = ref(localStorage.getItem('theme') === 'dark');
        const voiceSpeed = ref(1.0);
        const globalProgress = ref(0);
        
        // Data from Backend
        const db = ref([]);
        const units = ref([]);
        const lessonsData = ref([]);
        const jamoStrokes = ref({});

        // Fetch Data
        const loadData = async () => {
            try {
                const [vocabRes, curRes, lessonsRes, jamoRes] = await Promise.all([
                    fetch(`${API_BASE}/vocabulary`),
                    fetch(`${API_BASE}/curriculum`),
                    fetch(`${API_BASE}/lessons`),
                    fetch(`${API_BASE}/jamo-strokes`)
                ]);
                
                db.value = await vocabRes.json();
                units.value = await curRes.json();
                lessonsData.value = await lessonsRes.json();
                jamoStrokes.value = await jamoRes.json();
                
                isAppLoading.value = false;
                
                // Calculate progress mock
                globalProgress.value = 45; 
            } catch (error) {
                console.error("Error loading data from backend:", error);
                alert("Error conectando con el servidor. Asegúrate de que el backend esté corriendo en el puerto 3000.");
            }
        };


        const filterType = ref('all');
        const filteredLibrary = computed(() => {
            let res = db.value;
            if(filterType.value !== 'all') {
                res = res.filter(i => (i.type || 'vocab') === filterType.value);
            }
            if (!searchQuery.value) return res;
            const q = searchQuery.value.toLowerCase();
            return res.filter(i => i.es.toLowerCase().includes(q) || i.k.includes(q) || i.r.toLowerCase().includes(q));
        });

        
        // Modal & Draw
        const showModal = ref(false);
        const activeItem = ref({});
        const drawCanvas = ref(null);
        const brushSize = ref(8);
        let ctx = null;
        let isDrawing = false;
        
        const openModal = (item) => {
            activeItem.value = item;
            showModal.value = true;
            nextTick(() => setupCanvas());
        };
        

        const evaluateScore = ref(null);

        const drawJamos = (jamos, drawNumbers = false, isFaint = true) => {
            if (!ctx || !drawCanvas.value || !jamos || jamos.length === 0) return;
            const canvas = drawCanvas.value;
            const rect = canvas.parentElement.getBoundingClientRect();
            
            const padding = 20;
            const availableHeight = rect.height - padding * 2;
            const availableWidth = rect.width - padding * 2;
            
            let size = availableHeight;
            let totalWidth = jamos.length * size;
            if (totalWidth > availableWidth) {
                size = availableWidth / jamos.length;
                totalWidth = availableWidth;
            }
            
            const startX = (rect.width - totalWidth) / 2;
            const offsetY = (rect.height - size) / 2;
            const scale = size / 100;
            
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            jamos.forEach((jamo, index) => {
                const guide = jamoStrokes.value[jamo];
                if (!guide) return;
                
                const offsetX = startX + (index * size);
                
                ctx.lineWidth = isFaint ? 10 * scale : 4 * scale;
                if (isFaint) {
                    ctx.strokeStyle = isDarkMode.value ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.4)';
                } else {
                    ctx.strokeStyle = isDarkMode.value ? '#64748b' : '#cbd5e1';
                }

                guide.paths.forEach(pathStr => {
                    const p = new Path2D(pathStr);
                    ctx.save();
                    ctx.translate(offsetX, offsetY);
                    ctx.scale(scale, scale);
                    ctx.stroke(p);
                    ctx.restore();
                });
                
                if (drawNumbers) {
                    guide.points.forEach(pt => {
                        ctx.fillStyle = '#ec4899';
                        ctx.beginPath();
                        ctx.arc(offsetX + (pt.x * scale), offsetY + (pt.y * scale), 12 * scale, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.fillStyle = 'white';
                        ctx.font = `bold ${14 * scale}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(pt.n, offsetX + (pt.x * scale), offsetY + (pt.y * scale) + 1);
                    });
                }
            });
            updateBrush();
        };

        const setupCanvas = () => {
            const canvas = drawCanvas.value;
            if(!canvas) return;
            const rect = canvas.parentElement.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            clearCanvas();
        };
        
        const updateBrush = () => { if(!ctx) return; ctx.lineWidth = brushSize.value; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = isDarkMode.value ? '#818cf8' : '#4f46e5'; };
        const getCanvasCoords = (e) => { const rect = drawCanvas.value.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX); const y = e.clientY || (e.touches && e.touches[0].clientY); return { x: x - rect.left, y: y - rect.top }; };
        const startDraw = (e) => { isDrawing = true; const p = getCanvasCoords(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const draw = (e) => { if(!isDrawing) return; const p = getCanvasCoords(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
        const stopDraw = () => { isDrawing = false; };
        
        const clearCanvas = () => {
            if(ctx && drawCanvas.value) {
                ctx.clearRect(0, 0, drawCanvas.value.width, drawCanvas.value.height);
                evaluateScore.value = null;
                if (activeItem.value) {
                    const jamos = decomposeHangul(activeItem.value.k);
                    drawJamos(jamos, false, true);
                }
            }
        };
        
        const showStrokeGuide = () => {
            clearCanvas();
            if (activeItem.value) {
                const jamos = decomposeHangul(activeItem.value.k);
                drawJamos(jamos, true, false);
            }
        };

        const evaluateStroke = () => {
            if (!ctx || !drawCanvas.value || !activeItem.value) return;
            const canvas = drawCanvas.value;
            const jamos = decomposeHangul(activeItem.value.k);
            if (!jamos || jamos.length === 0) return;
            
            const offCanvas = document.createElement('canvas');
            offCanvas.width = canvas.width;
            offCanvas.height = canvas.height;
            const octx = offCanvas.getContext('2d', { willReadFrequently: true });
            
            const rect = canvas.parentElement.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            octx.scale(dpr, dpr);
            
            const padding = 20;
            let size = rect.height - padding * 2;
            let totalWidth = jamos.length * size;
            if (totalWidth > rect.width - padding * 2) {
                size = (rect.width - padding * 2) / jamos.length;
                totalWidth = rect.width - padding * 2;
            }
            
            const startX = (rect.width - totalWidth) / 2;
            const offsetY = (rect.height - size) / 2;
            const scale = size / 100;
            
            octx.lineCap = 'round';
            octx.lineJoin = 'round';
            
            jamos.forEach((jamo, index) => {
                const guide = jamoStrokes.value[jamo];
                if (!guide) return;
                const offsetX = startX + (index * size);
                
                octx.lineWidth = 30 * scale; 
                octx.strokeStyle = '#000000';
                
                guide.paths.forEach(pathStr => {
                    const p = new Path2D(pathStr);
                    octx.save();
                    octx.translate(offsetX, offsetY);
                    octx.scale(scale, scale);
                    octx.stroke(p);
                    octx.restore();
                });
            });
            
            const expectedData = octx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;
            const userData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            
            let expectedCount = 0; let coveredCount = 0;
            let userCount = 0; let outOfBoundsCount = 0;
            
            for (let i = 3; i < expectedData.length; i += 4) {
                const expectedAlpha = expectedData[i];
                const userAlpha = userData[i];
                const isExpected = expectedAlpha > 50;
                const isUser = userAlpha > 150;
                
                if (isExpected) expectedCount++;
                if (isUser) userCount++;
                if (isExpected && isUser) coveredCount++;
                if (!isExpected && isUser) outOfBoundsCount++;
            }
            
            if (expectedCount === 0 || userCount === 0) {
                evaluateScore.value = 0;
                return;
            }
            
            let coverage = coveredCount / expectedCount; 
            let penalty = outOfBoundsCount / expectedCount; 
            
            let score = (coverage * 100) - (penalty * 50); 
            score = Math.max(0, Math.min(100, Math.round(score)));
            evaluateScore.value = score;
            
            if (score >= 80) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        };
        
        const updateBrush = () => { if(!ctx) return; ctx.lineWidth = brushSize.value; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = isDarkMode.value ? '#818cf8' : '#4f46e5'; };
        const getCanvasCoords = (e) => { const rect = drawCanvas.value.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX); const y = e.clientY || (e.touches && e.touches[0].clientY); return { x: x - rect.left, y: y - rect.top }; };
        const startDraw = (e) => { isDrawing = true; const p = getCanvasCoords(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const draw = (e) => { if(!isDrawing) return; const p = getCanvasCoords(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
        const stopDraw = () => { isDrawing = false; };
        const clearCanvas = () => { if(ctx && drawCanvas.value) { ctx.clearRect(0, 0, drawCanvas.value.width, drawCanvas.value.height); } };
        

        const decomposeHangul = (str) => {
            const cho = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
            const jung = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
            const jong = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
            let result = [];
            for(let i=0; i<str.length; i++) {
                const code = str.charCodeAt(i) - 44032;
                if(code > -1 && code < 11172) {
                    const c = Math.floor(code / 588);
                    const j = Math.floor((code - (c * 588)) / 28);
                    const jo = code % 28;
                    result.push(cho[c]); result.push(jung[j]);
                    if(jo > 0) result.push(jong[jo]);
                } else if(str[i].match(/[ㄱ-ㅎㅏ-ㅣ]/)) {
                    result.push(str[i]);
                }
            }
            return result;
        };
        const showStrokeGuide = () => {
            clearCanvas();
            if (!ctx || !activeItem.value) return;
            const jamos = decomposeHangul(activeItem.value.k);
            if (!jamos || jamos.length === 0) return;
            
            const canvas = drawCanvas.value;
            const rect = canvas.getBoundingClientRect();
            const size = Math.min(100, rect.width / jamos.length);
            const totalWidth = jamos.length * size;
            let startX = (rect.width - totalWidth) / 2;
            
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            jamos.forEach((jamo, index) => {
                const guide = jamoStrokes.value[jamo];
                if (!guide) return;
                const offsetX = startX + (index * size);
                const offsetY = (rect.height - size) / 2;
                const scale = size / 100;
                
                ctx.lineWidth = 4;
                ctx.strokeStyle = isDarkMode.value ? '#334155' : '#cbd5e1';
                guide.paths.forEach(pathStr => {
                    const p = new Path2D(pathStr);
                    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); ctx.stroke(p); ctx.restore();
                });
                guide.points.forEach(pt => {
                    ctx.fillStyle = '#ec4899';
                    ctx.beginPath(); ctx.arc(offsetX + (pt.x * scale), offsetY + (pt.y * scale), 12 * scale, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'white'; ctx.font = `bold ${14 * scale}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(pt.n, offsetX + (pt.x * scale), offsetY + (pt.y * scale) + 1);
                });
            });
            updateBrush();
        };


        const availableVoices = ref([]);
        const selectedVoiceURI = ref(localStorage.getItem('selectedVoiceURI') || '');
        const loadVoices = () => {
            let voices = window.speechSynthesis.getVoices();
            availableVoices.value = voices.filter(v => v.lang.startsWith('ko'));
            if(availableVoices.value.length > 0 && !selectedVoiceURI.value) {
                selectedVoiceURI.value = availableVoices.value[0].voiceURI;
            }
        };
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
            loadVoices();
        }
        // Speech
        const speak = (text) => {
            if (!('speechSynthesis' in window)) return;
            const ut = new SpeechSynthesisUtterance(text);
            ut.lang = 'ko-KR';
            ut.rate = voiceSpeed.value;
            if(selectedVoiceURI.value) {
                const voice = availableVoices.value.find(v => v.voiceURI === selectedVoiceURI.value);
                if(voice) ut.voice = voice;
            }
            window.speechSynthesis.speak(ut);
        };

        // Study Logic
        const activeUnit = ref({});
        const studyMode = ref('theory');
        const studyList = ref([]);
        const studyIndex = ref(0);
        const currentStudyItem = computed(() => studyList.value[studyIndex.value] || {});
        
        // Theory mode state
        const theorySlideIndex = ref(0);
        const currentLesson = computed(() => lessonsData.value.find(l => l.id == activeUnit.value.id));
        const nextTheorySlide = () => { if(currentLesson.value && theorySlideIndex.value < currentLesson.value.slides.length - 1) theorySlideIndex.value++; };
        const prevTheorySlide = () => { if(theorySlideIndex.value > 0) theorySlideIndex.value--; };

        const getItemsForUnit = (id) => db.value.filter(i => i.l === id);
        const openUnit = (unit) => {
            activeUnit.value = unit;
            currentView.value = 'study';
            startMode('theory');
        };
        
        const startMode = (mode) => {
            studyMode.value = mode;
            studyList.value = getItemsForUnit(activeUnit.value.id);
            if(mode === 'exam') studyList.value.sort(() => Math.random() - 0.5);
            studyIndex.value = 0;
            theorySlideIndex.value = 0;
            fcFlipped.value = false;
            examScore.value = 0;
            resetExamState();
        };

        // Flashcard animations
        const fcFlipped = ref(false);
        const nextCard = () => { if(studyIndex.value < studyList.value.length - 1) { studyIndex.value++; fcFlipped.value = false; } };
        const prevCard = () => { if(studyIndex.value > 0) { studyIndex.value--; fcFlipped.value = false; } };

        // Exam
        const examInput = ref('');
        const examAnswered = ref(false);
        const examFeedback = ref('');
        const examScore = ref(0);
        const examInputClass = ref('bg-white dark:bg-slate-900 text-slate-800 dark:text-white border-slate-200 dark:border-slate-700 focus:border-primary');
        const examFeedbackColor = ref('');
        const examInputRef = ref(null);

        const resetExamState = () => {
            examInput.value = '';
            examAnswered.value = false;
            examFeedback.value = '';
            examInputClass.value = 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white border-slate-200 dark:border-slate-700 focus:border-primary';
            if(studyMode.value === 'exam') nextTick(() => { if(examInputRef.value) examInputRef.value.focus(); });
        };

        const submitExam = () => {
            if(examAnswered.value) { nextExam(); return; }
            const val = examInput.value.trim().toLowerCase();
            if(!val) return;
            
            const k = currentStudyItem.value;
            const isCorrect = val === k.r.toLowerCase() || k.es.toLowerCase().includes(val) || val === k.k;
            
            examAnswered.value = true;
            if(isCorrect) {
                examScore.value++;
                examInputClass.value = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
                examFeedback.value = '¡Correcto!';
                examFeedbackColor.value = 'text-emerald-500';
            } else {
                examInput.value = k.es;
                examInputClass.value = 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400';
                examFeedback.value = 'Incorrecto.';
                examFeedbackColor.value = 'text-rose-500';
            }
        };

        const nextExam = () => {
            if(studyIndex.value < studyList.value.length - 1) {
                studyIndex.value++;
                resetExamState();
            } else {
                confetti({ particleCount: 300, spread: 160, origin: { y: 0.6 }, colors: ['#6366f1', '#ec4899', '#ffffff'] });
                setTimeout(() => {
                    alert(`¡Examen finalizado! Puntuación: ${examScore.value}/${studyList.value.length}`);
                    currentView.value = 'path';
                }, 1500);
            }
        };

        // Theme
        const toggleTheme = () => {
            isDarkMode.value = !isDarkMode.value;
            if(isDarkMode.value) {
                localStorage.setItem('theme', 'dark');
                document.documentElement.classList.add('dark');
            } else {
                localStorage.setItem('theme', 'light');
                document.documentElement.classList.remove('dark');
            }
        };
        
        onMounted(() => {
            if (isDarkMode.value) document.documentElement.classList.add('dark');
            loadData();
        });

        return {
            isAppLoading,
            currentView, searchQuery, filterType, isDarkMode, toggleTheme, voiceSpeed, globalProgress, availableVoices, selectedVoiceURI,
            units, filteredLibrary, openUnit, getItemsForUnit,
            showModal, activeItem, openModal, drawCanvas, brushSize, startDraw, draw, stopDraw, clearCanvas, showStrokeGuide, updateBrush, speak, evaluateStroke, evaluateScore,
            activeUnit, studyMode, startMode, studyList, studyIndex, currentStudyItem,
            theorySlideIndex, currentLesson, nextTheorySlide, prevTheorySlide,
            fcFlipped, nextCard, prevCard,
            examInput, examAnswered, examFeedback, examScore, examInputClass, examFeedbackColor, submitExam, nextExam, examInputRef
        };
    }
}).mount('#app');
