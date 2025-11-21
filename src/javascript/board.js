
/************************************************************
 * INFINITE WHITEBOARD IMPLEMENTATION
 ************************************************************/

window.initBoard = function() {
    // Wrap everything in IIFE to avoid global scope pollution
    
    const DRAWING_STORAGE_KEY = 'whiteboardDrawings';
    const BOARD_STATE_KEY = 'whiteboardState';

    const workspace = document.getElementById('workspace');
    const scrollContainer = document.getElementById('scrollContainer');
    const customCursor = document.getElementById('customCursor');
    const edgesSvg = document.getElementById('edges-layer');

    if (!workspace || !scrollContainer || !customCursor || !edgesSvg) {
        console.error('Board elements not found in DOM. Cannot initialize.');
        return;
    }

    console.log('✅ Board elements found, initializing...');

    /***********************
     * TOOLBAR ELEMENTS
     ***********************/
    const addFrameBtn = document.getElementById('addFrame');
    const addNoteBtn = document.getElementById('addNote');
    const addTaskBtn = document.getElementById('addTask');
    // New Flow Buttons
    const addRectNodeBtn = document.getElementById('addRectNode');
    const addCircleNodeBtn = document.getElementById('addCircleNode');
    const addDiamondNodeBtn = document.getElementById('addDiamondNode');
    
    // Undo/Redo
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    const penToolBtn = document.getElementById('penTool');
    const eraserToolBtn = document.getElementById('eraserTool');
    const mouseToolBtn = document.getElementById('mouseTool');
    
    const penPopup = document.getElementById('penPopup');
    const eraserPopup = document.getElementById('eraserPopup');
    const penColorsContainer = document.getElementById('penColors');
    const penSizesContainer = document.getElementById('penSizes');
    const eraserSizesContainer = document.getElementById('eraserSizes');
    const customColorInput = document.getElementById('customColor');
    const customColorPreview = document.getElementById('customColorPreview');

    /***********************
     * TRACKER ELEMENTS
     ***********************/
    const trackerContainer = document.getElementById('tracker-container');
    const trackerExpanded = document.getElementById('tracker-expanded');
    const trackerToggleCollapsed = document.getElementById('tracker-toggle-collapsed');
    const trackerToggleExpanded = document.getElementById('tracker-toggle-expanded');
    const trackerList = document.getElementById('tracker-list');
    const countFrames = document.getElementById('tracker-count-frames');
    const countNotes = document.getElementById('tracker-count-notes');
    const countNodes = document.getElementById('tracker-count-nodes');

    /***********************
     * SETTINGS ELEMENTS
     ***********************/
    const settingsModal = document.getElementById('settings-modal');
    const settingsCard = document.getElementById('settings-card');
    const settingsBackdrop = document.getElementById('settings-backdrop');
    const gearIcon = document.getElementById('gear-icon');
    const closeSettingsBtn = document.getElementById('close-settings');
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    /***********************
     * STATE VARIABLES
     ***********************/
    let frames = []; 
    let notes = []; 
    let flowNodes = []; // Store flow nodes
    let sprintLists = []; // Store sprint task lists
    let edges = []; // Store connections: { id, startNodeId, startHandle, endNodeId, endHandle, pathEl }
    
    let activeTool = 'mouse';
    let penColor = '#1a1a1a';
    let penSize = 2;
    let eraserSize = 15;
    let isMovingElement = false; 
    let openPopup = null;
    let drawingsData = {}; 

    // Zoom State
    let currentScale = 1;

    // History Stack
    let history = [];
    let historyStep = -1;
    const MAX_HISTORY = 50;

    /***********************
     * ZOOM FUNCTIONALITY
     ***********************/
    
    // Remove CSS transition for transform to ensure instant JS response without lag
    workspace.style.transition = 'none';
    workspace.style.transformOrigin = '0 0'; // Ensure top-left origin

    scrollContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault(); // Stop browser native zoom/scroll
            
            // Force auto scroll behavior to prevent diagonal drift from smooth scrolling settings
            scrollContainer.style.scrollBehavior = 'auto';

            // Trackpads generate many small events; using a sensitivity factor
            const sensitivity = 0.01;
            const delta = -e.deltaY * sensitivity;
            
            // Get mouse position relative to the scroll viewport
            const rect = scrollContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 1. Calculate the point on the workspace under the mouse (unscaled coords)
            //    Formula: (MousePos + ScrollPos) / Scale
            const workspaceMouseX = (mouseX + scrollContainer.scrollLeft) / currentScale;
            const workspaceMouseY = (mouseY + scrollContainer.scrollTop) / currentScale;

            // 2. Calculate new scale
            let newScale = currentScale + delta;
            // Clamp scale between 0.1 and 5
            newScale = Math.min(Math.max(0.1, newScale), 5);

            // 3. Apply new scale
            currentScale = newScale;
            workspace.style.transform = `scale(${currentScale})`;
            
            // 4. Adjust scroll position so the workspace point is still under the mouse
            //    NewScrollPos = (WorkspacePoint * NewScale) - MousePos
            scrollContainer.scrollLeft = (workspaceMouseX * currentScale) - mouseX;
            scrollContainer.scrollTop = (workspaceMouseY * currentScale) - mouseY;
        }
    }, { passive: false });


    /***********************
     * TRACKER LOGIC
     ***********************/
    let isTrackerOpen = false;

    function updateTracker() {
        if (!trackerList) return;
        
        trackerList.innerHTML = '';
        
        // Update Counts
        if (countFrames) countFrames.innerText = frames.length;
        if (countNotes) countNotes.innerText = notes.length;
        if (countNodes) countNodes.innerText = flowNodes.length;

        const addItem = (icon, color, text, id) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-2 p-2 rounded-xl bg-[#2b3037] border border-gray-700 hover:bg-gray-700 transition cursor-pointer group';            
            const iconDiv = document.createElement('div');
            iconDiv.className = `w-6 h-6 rounded-md flex items-center justify-center ${color} text-white text-xs shrink-0`;            
            iconDiv.innerHTML = `<i class="${icon}"></i>`;
            
            const span = document.createElement('span');
            span.className = 'text-xs text-gray-300 truncate flex-1';
            span.innerText = text;

            const btnLocate = document.createElement('button');
            btnLocate.className = 'text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity';
            btnLocate.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            btnLocate.title = "Locate on Board";
            btnLocate.onclick = (e) => {
                e.stopPropagation();
                locateElement(id);
            };

            item.appendChild(iconDiv);
            item.appendChild(span);
            item.appendChild(btnLocate);
            trackerList.appendChild(item);
        };

        const addGroupHeader = (title) => {
            const header = document.createElement('div');
            header.className = 'text-[10px] uppercase font-bold text-gray-500 mt-3 mb-1 px-2 tracking-wider';
            header.innerText = title;
            trackerList.appendChild(header);
        };

        // Render Frames
        if (frames.length > 0) addGroupHeader('Frames');
        frames.forEach(f => {
            const title = f.element.querySelector('.frame-title-input').value || 'Untitled Board';
            addItem('fa-solid fa-crop-simple', 'bg-blue-600', title, f.id);
        });

        // Render Task Lists
        if (sprintLists.length > 0) addGroupHeader('Task Lists');
        sprintLists.forEach(l => {
            addItem('fa-solid fa-list-check', 'bg-indigo-600', l.title || 'Sprint Tasks', l.id);
        });

        // Render Notes Grouped by Sprint
        const sprintGroups = { 'Sprint 1': [], 'Sprint 2': [], 'Sprint 3': [], 'Unassigned': [] };
        notes.forEach(n => {
            const sprint = n.dataset.sprint || 'Unassigned';
            const val = n.querySelector('textarea').value.substring(0, 20) || 'Empty Note';
            const data = { val, id: n.dataset.id };
            if (sprintGroups[sprint]) {
                sprintGroups[sprint].push(data);
            } else {
                sprintGroups['Unassigned'].push(data);
            }
        });

        Object.keys(sprintGroups).forEach(sprint => {
            if (sprintGroups[sprint].length > 0) {
                addGroupHeader(sprint === 'Unassigned' ? 'Notes' : sprint);
                sprintGroups[sprint].forEach(item => {
                    addItem('fa-solid fa-note-sticky', 'bg-yellow-500', item.val, item.id);
                });
            }
        });

        // Render Flow Nodes
        if (flowNodes.length > 0) addGroupHeader('Flow Nodes');
        flowNodes.forEach(n => {
            let txt = n.querySelector('span').innerText || 'Node';
            let icon = 'fa-regular fa-circle';
            let col = 'bg-emerald-600';
            
            if(n.dataset.type === 'rect') { icon = 'fa-regular fa-square'; col = 'bg-blue-600'; }
            if(n.dataset.type === 'diamond') { icon = 'fa-solid fa-diamond'; col = 'bg-purple-600'; }
            
            addItem(icon, col, txt, n.dataset.id);
        });
    }

    function locateElement(id) {
        // Find element in DOM
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return;

        // Highlight effect
        el.classList.add('ring-4', 'ring-yellow-400', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-4', 'ring-yellow-400', 'ring-offset-2'), 1000);
        
        // Basic centering logic (approximation for scaled view)
        const rect = el.getBoundingClientRect(); // Scaled dimensions
        
        // Get scroll container dimensions
        const containerW = scrollContainer.clientWidth;
        const containerH = scrollContainer.clientHeight;

        // Calculate center difference relative to current viewport
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const targetX = containerW / 2;
        const targetY = containerH / 2;
        
        // Reset behavior to smooth for locating
        scrollContainer.style.scrollBehavior = 'smooth';
        scrollContainer.scrollBy({
            left: centerX - targetX,
            top: centerY - targetY,
            behavior: 'smooth'
        });
    }

    function toggleTracker() {
        isTrackerOpen = !isTrackerOpen;
        renderTrackerSidebar();
    }

    function renderTrackerSidebar() {
        if (!trackerContainer) return;

        // CSS transitions handle dimensions
        // Collapsed state is now 95% from top as requested
        trackerContainer.style.top = isTrackerOpen ? "7.5%" : "95%"; 
        trackerContainer.style.transform = isTrackerOpen ? "translateY(0)" : "translateY(-50%)";
        trackerContainer.style.width = isTrackerOpen ? "16rem" : "2.5rem";
        trackerContainer.style.height = isTrackerOpen ? "90vh" : "2.5rem"; 
        trackerContainer.style.borderRadius = isTrackerOpen ? "1.25rem" : "50%";

        if (isTrackerOpen) {
            // Opening
            trackerToggleCollapsed.style.opacity = '0';
            trackerToggleCollapsed.style.pointerEvents = 'none';

            trackerExpanded.style.display = 'flex';
            trackerExpanded.style.opacity = '0';
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    trackerExpanded.style.opacity = '1';
                    trackerExpanded.style.pointerEvents = 'auto';
                });
            });

            setTimeout(() => {
                trackerToggleCollapsed.style.display = 'none';
            }, 300);
        } else {
            // Closing
            trackerExpanded.style.opacity = '0';
            trackerExpanded.style.pointerEvents = 'none';

            trackerToggleCollapsed.style.display = 'flex';
            trackerToggleCollapsed.style.opacity = '0';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    trackerToggleCollapsed.style.opacity = '1';
                    trackerToggleCollapsed.style.pointerEvents = 'auto';
                });
            });

            setTimeout(() => {
                if (!isTrackerOpen) trackerExpanded.style.display = 'none';
            }, 300);
        }
    }

    if (trackerToggleCollapsed) {
        trackerToggleCollapsed.addEventListener('click', toggleTracker);
        trackerToggleExpanded.addEventListener('click', toggleTracker);
        
        // Init styles
        trackerExpanded.style.transition = 'opacity 0.3s ease-in-out';
        trackerToggleCollapsed.style.transition = 'opacity 0.3s ease-in-out';
    }

    /***********************
     * SETTINGS & THEME LOGIC
     ***********************/
    function initSettings() {
        const toggleSettings = (show) => {
            if (show) {
                settingsModal.classList.remove('opacity-0', 'pointer-events-none');
                settingsCard.classList.remove('scale-95');
                settingsCard.classList.add('scale-100');
            } else {
                settingsModal.classList.add('opacity-0', 'pointer-events-none');
                settingsCard.classList.remove('scale-100');
                settingsCard.classList.add('scale-95');
            }
        };

        if (gearIcon) {
            gearIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSettings(true);
            });
        }

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => toggleSettings(false));
        }

        if (settingsBackdrop) {
            settingsBackdrop.addEventListener('click', () => toggleSettings(false));
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !settingsModal.classList.contains('opacity-0')) {
                toggleSettings(false);
            }
        });

        // Theme Logic
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            if(darkModeToggle) darkModeToggle.checked = false;
        } else {
            document.body.classList.remove('light-mode');
            if(darkModeToggle) darkModeToggle.checked = true;
        }

        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.remove('light-mode');
                    localStorage.setItem('theme', 'dark');
                } else {
                    document.body.classList.add('light-mode');
                    localStorage.setItem('theme', 'light');
                }
            });
        }
    }


    /***********************
     * UNDO / REDO SYSTEM
     ***********************/
    function pushHistory(action) {
        // Remove any history ahead of current step (if we redid then did new action)
        if (historyStep < history.length - 1) {
            history = history.slice(0, historyStep + 1);
        }
        history.push(action);
        if (history.length > MAX_HISTORY) {
            history.shift();
        } else {
            historyStep++;
        }
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        if (!undoBtn || !redoBtn) return;
        undoBtn.disabled = historyStep < 0;
        redoBtn.disabled = historyStep >= history.length - 1;
        undoBtn.classList.toggle('opacity-80', historyStep < 0);
        redoBtn.classList.toggle('opacity-80', historyStep >= history.length - 1);
    }

    if (undoBtn) {
        undoBtn.onclick = () => {
            if (historyStep >= 0) {
                const action = history[historyStep];
                undoAction(action);
                historyStep--;
                updateUndoRedoUI();
            }
        };
    }

    if (redoBtn) {
        redoBtn.onclick = () => {
            if (historyStep < history.length - 1) {
                historyStep++;
                const action = history[historyStep];
                redoAction(action);
                updateUndoRedoUI();
            }
        };
    }

    // Key listeners for undo/redo
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (undoBtn) undoBtn.click();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
            e.preventDefault();
            if (redoBtn) redoBtn.click();
        }
    });

    function undoAction(action) {
        switch (action.type) {
            case 'DRAW':
                // Restore previous canvas state
                const ctx = action.canvas.getContext('2d');
                ctx.putImageData(action.before, 0, 0);
                saveDrawingToLocalStorage(action.frameId, action.canvas);
                break;
            case 'ADD_ELEMENT':
                action.element.remove();
                // Also remove associated data from arrays
                if (action.elementType === 'frame') frames = frames.filter(f => f.id !== action.id);
                if (action.elementType === 'note') notes = notes.filter(n => n.dataset.id != action.id);
                if (action.elementType === 'sprintList') sprintLists = sprintLists.filter(l => l.id !== action.id);
                if (action.elementType === 'flowNode') {
                     flowNodes = flowNodes.filter(n => n.dataset.id != action.id);
                     edges.forEach(e => {
                        if (e.sourceNodeId == action.id || e.targetNodeId == action.id) {
                            e.pathEl.style.display = 'none';
                        }
                     });
                }
                updateTracker();
                break;
            case 'MOVE_ELEMENT':
                const el = action.element;
                el.style.left = action.oldX + 'px';
                el.style.top = action.oldY + 'px';
                if (action.elementType === 'flowNode') updateEdges();
                break;
            case 'ADD_EDGE':
                action.edge.pathEl.remove();
                edges = edges.filter(e => e.id !== action.edge.id);
                break;
        }
    }

    function redoAction(action) {
        switch (action.type) {
            case 'DRAW':
                const ctx = action.canvas.getContext('2d');
                ctx.putImageData(action.after, 0, 0);
                saveDrawingToLocalStorage(action.frameId, action.canvas);
                break;
            case 'ADD_ELEMENT':
                action.parent.appendChild(action.element);
                if (action.elementType === 'frame') frames.push({ id: action.id, element: action.element }); 
                if (action.elementType === 'note') notes.push(action.element);
                if (action.elementType === 'sprintList') sprintLists.push(action.data);
                if (action.elementType === 'flowNode') {
                    flowNodes.push(action.element);
                    updateEdges();
                }
                updateTracker();
                break;
            case 'MOVE_ELEMENT':
                const el = action.element;
                el.style.left = action.newX + 'px';
                el.style.top = action.newY + 'px';
                if (action.elementType === 'flowNode') updateEdges();
                break;
            case 'ADD_EDGE':
                edgesSvg.appendChild(action.edge.pathEl);
                edges.push(action.edge);
                break;
        }
    }


    // --- Toolbar Setup (Colors & Sizes) ---
    const presetColors = ['#1a1a1a', '#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffb703', '#fb8500', '#8338ec', '#3a86ff', '#06d6a0'];
    presetColors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'w-6 h-6 flex-shrink-0 rounded-full border-2 cursor-pointer';
        div.style.backgroundColor = color;
        div.onclick = () => { penColor = color; customColorPreview.style.backgroundColor = color; };
        penColorsContainer.appendChild(div);
    });
    customColorPreview.style.backgroundColor = penColor;
    customColorInput.addEventListener('change', e => {
        penColor = e.target.value;
        customColorPreview.style.backgroundColor = penColor;
    });

    [2, 5, 10, 20].forEach(size => {
        const dot = document.createElement('div');
        dot.className = 'rounded-full flex-shrink-0 bg-gray-500 hover:scale-110 hover:bg-gray-700 transition cursor-pointer';
        dot.style.width = `${size / 2 + 4}px`;
        dot.style.height = `${size / 2 + 4}px`;
        dot.onclick = () => penSize = size;
        penSizesContainer.appendChild(dot);
    });

    [10, 20, 30].forEach(size => {
        const dot = document.createElement('div');
        dot.className = 'bg-gray-500 rounded-full cursor-pointer hover:scale-110 hover:bg-gray-700 transition';
        dot.style.width = `${size / 5 + 4}px`;
        dot.style.height = `${size / 5 + 4}px`;
        dot.onclick = () => eraserSize = size;
        eraserSizesContainer.appendChild(dot);
    });

    // --- Toolbar Logic ---
    function closePopups() {
        penPopup.classList.add('hidden');
        eraserPopup.classList.add('hidden');
        openPopup = null;
    }

    function togglePopup(name) {
        closePopups();
        if (openPopup === name || activeTool === name) {
            activeTool = 'mouse';
            return;
        }
        if (name === 'pen') {
            penPopup.classList.remove('hidden');
            activeTool = 'pen';
            openPopup = 'pen';
        } 
        else if (name === 'eraser') {
            eraserPopup.classList.remove('hidden');
            activeTool = 'eraser';
            openPopup = 'eraser';
        }
    }

    penToolBtn.onclick = () => togglePopup('pen');
    eraserToolBtn.onclick = () => togglePopup('eraser');
    mouseToolBtn.onclick = () => {
        activeTool = 'mouse';
        closePopups();
    };
    addFrameBtn.onclick = () => addFrame();
    addNoteBtn.onclick = () => {
        const selectedBoard = document.querySelector('.canvas-frame.ring-blue-500');
        addStickyNote(selectedBoard || workspace);
    };
    addTaskBtn.onclick = () => addSprintList();

    addRectNodeBtn.onclick = () => createFlowNode('rect');
    addCircleNodeBtn.onclick = () => createFlowNode('circle');
    addDiamondNodeBtn.onclick = () => createFlowNode('diamond');

    /***********************
     * SAVE & LOAD FUNCTIONALITY
     ***********************/
    const saveBtn = document.getElementById('save-button');
    const saveStatusText = document.getElementById('save-status-text');
    const savePopup = document.getElementById('save-popup');
    let saveInterval;
    let lastSaveTime = null;

    function saveBoardState() {
        // Ensure sprint list data is up to date
        const currentSprintLists = [];
        document.querySelectorAll('.sprint-list').forEach(el => {
            const id = el.dataset.id;
            const listObj = sprintLists.find(l => l.id == id);
            if(listObj) {
                listObj.x = el.style.left;
                listObj.y = el.style.top;
                currentSprintLists.push(listObj);
            }
        });

        const state = {
            timestamp: Date.now(),
            frames: frames.map(f => ({
                id: f.id,
                x: f.element.style.left,
                y: f.element.style.top,
                w: f.element.style.width,
                h: f.element.style.height,
                title: f.element.querySelector('.frame-title-input').value
            })),
            notes: notes.map(n => ({
                id: n.dataset.id,
                x: n.style.left,
                y: n.style.top,
                w: n.style.width,
                h: n.style.height,
                content: n.querySelector('textarea').value,
                sprint: n.dataset.sprint || null,
                parentId: n.parentElement.classList.contains('canvas-frame') ? n.parentElement.dataset.id : 'workspace'
            })),
            sprintLists: currentSprintLists,
            flowNodes: flowNodes.map(n => ({
                id: n.dataset.id,
                type: n.dataset.type,
                x: n.style.left,
                y: n.style.top,
                text: n.querySelector('span').innerText
            })),
            edges: edges.map(e => ({
                id: e.id,
                sourceNodeId: e.sourceNodeId,
                sourceHandle: e.sourceHandle,
                targetNodeId: e.targetNodeId,
                targetHandle: e.targetHandle
            }))
        };

        localStorage.setItem(BOARD_STATE_KEY, JSON.stringify(state));
    }

    function loadBoardState() {
        const json = localStorage.getItem(BOARD_STATE_KEY);
        if (!json) return false;

        const state = JSON.parse(json);

        // Clear current board
        workspace.innerHTML = '';
        workspace.appendChild(edgesSvg);
        frames = [];
        notes = [];
        flowNodes = [];
        sprintLists = [];
        edges = [];
        while (edgesSvg.childNodes.length > 2) { 
            edgesSvg.removeChild(edgesSvg.lastChild);
        }

        // Restore Frames
        state.frames.forEach(f => {
            createFrame(
                parseFloat(f.x), parseFloat(f.y), 
                parseFloat(f.w), parseFloat(f.h), 
                f.title, f.id
            );
        });

        // Restore Flow Nodes
        state.flowNodes.forEach(n => {
            createFlowNode(n.type, n.id, parseFloat(n.x), parseFloat(n.y), n.text);
        });

        // Restore Notes
        state.notes.forEach(n => {
            let parent = workspace;
            if (n.parentId && n.parentId !== 'workspace') {
                const parentFrame = frames.find(f => f.id == n.parentId);
                if (parentFrame) parent = parentFrame.element;
            }
            addStickyNote(parent, n.id, n.content, parseFloat(n.x), parseFloat(n.y), n.sprint);
        });

        // Restore Sprint Lists
        if (state.sprintLists) {
            state.sprintLists.forEach(l => {
                addSprintList(parseFloat(l.x), parseFloat(l.y), l.id, l);
            });
        }

        // Restore Edges
        state.edges.forEach(e => {
            createEdge(e.sourceNodeId, e.sourceHandle, e.targetNodeId, e.targetHandle, e.id);
        });

        updateTracker(); 
        return true;
    }

    if (saveBtn && saveStatusText) {
        saveBtn.onclick = () => {
            saveStatusText.innerText = 'Saving...';
            saveBoardState();
            setTimeout(() => {
                lastSaveTime = Date.now();
                saveStatusText.innerText = 'Saved';
                if (savePopup) {
                    savePopup.style.display = 'flex';
                    savePopup.classList.remove('animate-fade-in-out');
                    void savePopup.offsetWidth;
                    savePopup.classList.add('animate-fade-in-out');
                    setTimeout(() => savePopup.style.display = 'none', 2000);
                }
                if (saveInterval) clearInterval(saveInterval);
                saveInterval = setInterval(() => {
                    const diff = Math.floor((Date.now() - lastSaveTime) / 60000);
                    if (diff >= 1) {
                        saveStatusText.innerText = `Saved ${diff} minute${diff > 1 ? 's' : ''} ago`;
                    } else {
                         saveStatusText.innerText = 'Saved';
                    }
                }, 60000);
            }, 600);
        };
    }

    /***********************
     * DRAWING & STORAGE
     ***********************/

    function saveDrawingToLocalStorage(id, canvas) {
        drawingsData[id] = {
            data: canvas.toDataURL(),
            originalWidth: canvas.width,
            originalHeight: canvas.height
        };
        localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(drawingsData));
    }

    function loadDrawingFromLocalStorage(id, canvas, ctx) {
        if (drawingsData[id]) {
            const data = drawingsData[id];
            const img = new Image();
            img.onload = () => {
                const currentWidth = canvas.width;
                const currentHeight = canvas.height;
                canvas.width = data.originalWidth;
                canvas.height = data.originalHeight;
                ctx.drawImage(img, 0, 0);
                canvas.width = currentWidth;
                canvas.height = currentHeight;
            };
            img.src = data.data;
        }
    }

    /*******************************************************
     * FLOW CHART SYSTEM - UPDATED TO HOMEPAGE PILL STYLE
     *******************************************************/
    
    function getCenterPos() {
        const scrollLeft = scrollContainer.scrollLeft;
        const scrollTop = scrollContainer.scrollTop;
        const containerWidth = scrollContainer.clientWidth;
        const containerHeight = scrollContainer.clientHeight;
        return {
            x: scrollLeft + containerWidth / 2,
            y: scrollTop + containerHeight / 2
        };
    }

    function createFlowNode(type, id = null, x = null, y = null, textContent = null) {
        if (!x || !y) {
            const center = getCenterPos();
            x = center.x + (Math.random() * 100 - 50);
            y = center.y + (Math.random() * 100 - 50);
        }
        
        const nodeId = id || Date.now();
        const displayText = textContent || (type === 'circle' ? 'Start' : (type === 'rect' ? 'Analysis' : 'Prototype'));

        // Styles based on Homepage "Pill" Nodes
        // Circle/Start -> Emerald, Rect/Analysis -> Blue, Diamond/Prototype -> Purple
        const styles = {
            circle: { dot: 'bg-emerald-400', shadow: 'shadow-[0_0_0_2px_rgba(52,211,153,0.2)]' },
            rect: { dot: 'bg-blue-400', shadow: 'shadow-[0_0_0_2px_rgba(96,165,250,0.2)]' },
            diamond: { dot: 'bg-purple-400', shadow: 'shadow-[0_0_0_2px_rgba(192,132,252,0.2)]' }
        };
        const style = styles[type] || styles.circle;

        // Node Container - Pill Shape
        const node = document.createElement('div');
        node.dataset.id = nodeId;
        node.dataset.type = type;
        node.className = 'absolute w-32 h-14 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center gap-2 z-10 select-none group hover:shadow-md transition-shadow';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        // Content
        node.innerHTML = `
            <div class="w-2 h-2 rounded-full ${style.dot} ${style.shadow} pointer-events-none"></div>
            <span class="text-sm font-semibold text-gray-700 pointer-events-none">${displayText}</span>
        `;

        // Handles
        const handles = ['top', 'right', 'bottom', 'left'];
        handles.forEach(pos => {
            const h = document.createElement('div');
            h.className = `flow-handle handle-${pos} opacity-0 group-hover:opacity-100`;
            h.dataset.handle = pos;
            h.dataset.nodeId = nodeId;
            node.appendChild(h);
            setupHandleEvents(h, node);
        });

        // Editable Text
        node.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const textSpan = node.querySelector('span');
            const currentText = textSpan.innerText;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentText;
            input.className = 'bg-transparent text-center w-20 outline-none text-sm font-semibold text-gray-700';
            
            textSpan.replaceWith(input);
            input.focus();
            
            const save = () => {
                const newText = input.value || 'Node';
                const newSpan = document.createElement('span');
                newSpan.className = 'text-sm font-semibold text-gray-700 pointer-events-none';
                newSpan.innerText = newText;
                input.replaceWith(newSpan);
                updateTracker();
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (ev) => { if(ev.key === 'Enter') save(); });
        });

        workspace.appendChild(node);
        flowNodes.push(node);

        if (!id) {
            pushHistory({
                type: 'ADD_ELEMENT',
                elementType: 'flowNode',
                id: nodeId,
                element: node,
                parent: workspace
            });
        }

        setupDraggable(node, 'flowNode');
        updateTracker();
    }

    /***********************
     * SPRINT TASK LIST
     ***********************/
    function addSprintList(x = null, y = null, id = null, existingData = null) {
        if (!x || !y) {
            const center = getCenterPos();
            x = center.x - 128; 
            y = center.y - 100; 
        }
        
        const listId = id || Date.now();
        const data = existingData || {
            id: listId,
            title: 'Sprint Tasks',
            items: [
                { text: 'User Research', completed: true },
                { text: 'High-fi Mocks', completed: false },
                { text: 'Interaction', completed: false }
            ]
        };

        // Container
        const container = document.createElement('div');
        container.className = 'absolute w-64 bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none sprint-list z-10';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.dataset.id = listId;

        // Render Content
        const renderContent = () => {
            const count = data.items.length;
            
            // Header
            let html = `
                <div class="px-5 py-4 border-b border-gray-100 bg-gray-50/30 flex justify-between items-center handle-drag">
                     <h4 class="text-xs font-bold text-gray-900 flex items-center gap-2 pointer-events-none">
                        <div class="w-2 h-2 rounded-sm bg-indigo-500"></div>
                        ${data.title}
                     </h4>
                     <div class="flex gap-1">
                         <span class="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded pointer-events-none">${count} items</span>
                         <i class="fa-solid fa-xmark text-gray-300 hover:text-red-400 cursor-pointer ml-2 text-xs delete-btn"></i>
                     </div>
                </div>
                <div class="p-2 space-y-0.5 items-container">
            `;

            data.items.forEach((item, idx) => {
                if (item.completed) {
                    html += `
                    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer task-item" data-idx="${idx}">
                        <div class="w-5 h-5 bg-indigo-500 rounded-[6px] flex items-center justify-center shrink-0 transition-transform">
                            <i class="fa-solid fa-check text-white text-[10px]" style="stroke-width: 3px;"></i>
                        </div> 
                        <span class="text-sm text-gray-400 line-through decoration-gray-200 font-medium">${item.text}</span>
                    </div>`;
                } else {
                    html += `
                    <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer task-item" data-idx="${idx}">
                        <div class="w-5 h-5 border-[1.5px] border-gray-300 rounded-[6px] group-hover:border-indigo-400 transition-colors bg-white shrink-0"></div> 
                        <span class="text-sm text-gray-700 font-medium">${item.text}</span>
                    </div>`;
                }
            });
            
            html += `
                 <div class="p-2 mt-1 border-t border-gray-50">
                    <input type="text" placeholder="+ Add item" class="w-full text-xs bg-transparent outline-none text-gray-500 hover:bg-gray-50 p-1 rounded px-2 new-item-input">
                 </div>
            </div>`;
            
            container.innerHTML = html;

            // Bind Events
            container.querySelectorAll('.task-item').forEach(el => {
                el.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevent drag start
                el.addEventListener('click', () => {
                    const idx = parseInt(el.dataset.idx);
                    data.items[idx].completed = !data.items[idx].completed;
                    renderContent();
                });
            });

            const input = container.querySelector('.new-item-input');
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    data.items.push({ text: input.value.trim(), completed: false });
                    renderContent();
                }
            });

            const delBtn = container.querySelector('.delete-btn');
            delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            delBtn.addEventListener('click', () => {
                container.remove();
                sprintLists = sprintLists.filter(l => l.id !== listId);
                updateTracker();
            });
        };

        renderContent();
        workspace.appendChild(container);
        
        if(!existingData) {
            sprintLists.push(data);
            pushHistory({
                type: 'ADD_ELEMENT',
                elementType: 'sprintList',
                id: listId,
                element: container,
                data: data,
                parent: workspace
            });
        } else {
            // Ensure we update the reference if reloading
            const idx = sprintLists.findIndex(l => l.id === listId);
            if(idx === -1) sprintLists.push(data);
            else sprintLists[idx] = data;
        }

        setupDraggable(container, 'sprintList');
        updateTracker();
    }


    // --- Handle Connections ---
    let activeConnectionLine = null;
    let startHandleInfo = null;

    function setupHandleEvents(handle, node) {
        handle.addEventListener('mousedown', (e) => {
            if (activeTool !== 'mouse') return;
            e.stopPropagation();
            e.preventDefault(); 
            
            const rect = handle.getBoundingClientRect();
            const wsRect = workspace.getBoundingClientRect();
            const startX = rect.left + rect.width/2 - wsRect.left;
            const startY = rect.top + rect.height/2 - wsRect.top;

            startHandleInfo = {
                nodeId: node.dataset.id,
                handlePos: handle.dataset.handle,
                x: startX,
                y: startY
            };

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke', '#3b82f6');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-dasharray', '5,5');
            edgesSvg.appendChild(path);
            activeConnectionLine = path;

            document.addEventListener('mousemove', onDragLine);
            document.addEventListener('mouseup', onEndLine);
        });
    }

    function onDragLine(e) {
        if (!activeConnectionLine || !startHandleInfo) return;
        
        const wsRect = workspace.getBoundingClientRect();
        const mouseX = e.clientX - wsRect.left;
        const mouseY = e.clientY - wsRect.top;

        const d = getBezierPath(startHandleInfo.x, startHandleInfo.y, mouseX, mouseY, startHandleInfo.handlePos);
        activeConnectionLine.setAttribute('d', d);
    }

    function onEndLine(e) {
        document.removeEventListener('mousemove', onDragLine);
        document.removeEventListener('mouseup', onEndLine);

        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        
        if (targetEl && targetEl.classList.contains('flow-handle')) {
            const targetNodeId = targetEl.dataset.nodeId;
            if (targetNodeId !== startHandleInfo.nodeId) {
                createEdge(startHandleInfo.nodeId, startHandleInfo.handlePos, targetNodeId, targetEl.dataset.handle);
            }
        }

        if (activeConnectionLine) {
            activeConnectionLine.remove();
            activeConnectionLine = null;
        }
        startHandleInfo = null;
    }

    function createEdge(sourceId, sourceHandle, targetId, targetHandle, id = null) {
        const edgeId = id || (Date.now() + '_' + Math.random());
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'edge-path');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        path.dataset.id = edgeId;
        
        path.addEventListener('click', (e) => {
            if (e.shiftKey || activeTool === 'eraser') { 
                path.remove();
                edges = edges.filter(ed => ed.id !== edgeId);
            }
        });
        path.addEventListener('mouseover', () => path.setAttribute('marker-end', 'url(#arrowhead-hover)'));
        path.addEventListener('mouseout', () => path.setAttribute('marker-end', 'url(#arrowhead)'));

        edgesSvg.appendChild(path);

        const edgeObj = {
            id: edgeId,
            sourceNodeId: sourceId,
            sourceHandle: sourceHandle,
            targetNodeId: targetId,
            targetHandle: targetHandle,
            pathEl: path
        };
        edges.push(edgeObj);

        updateEdges();

        if (!id) {
            pushHistory({
                type: 'ADD_EDGE',
                edge: edgeObj
            });
        }
    }

    function updateEdges() {
        edges.forEach(edge => {
            const sourceNode = document.querySelector(`[data-id="${edge.sourceNodeId}"]`);
            const targetNode = document.querySelector(`[data-id="${edge.targetNodeId}"]`);
            
            if (!sourceNode || !targetNode) {
                edge.pathEl.style.display = 'none';
                return;
            }
            edge.pathEl.style.display = 'block';

            const sHandle = sourceNode.querySelector(`.handle-${edge.sourceHandle}`);
            const tHandle = targetNode.querySelector(`.handle-${edge.targetHandle}`);
            
            if(!sHandle || !tHandle) return;

            const wsRect = workspace.getBoundingClientRect();
            const sRect = sHandle.getBoundingClientRect();
            const tRect = tHandle.getBoundingClientRect();

            const startX = sRect.left + sRect.width/2 - wsRect.left;
            const startY = sRect.top + sRect.height/2 - wsRect.top;
            const endX = tRect.left + tRect.width/2 - wsRect.left;
            const endY = tRect.top + tRect.height/2 - wsRect.top;

            const d = getBezierPath(startX, startY, endX, endY, edge.sourceHandle, edge.targetHandle);
            edge.pathEl.setAttribute('d', d);
        });
    }

    function getBezierPath(sx, sy, ex, ey, startPos, endPos = null) {
        const dist = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
        const curvature = Math.min(dist * 0.5, 150); 

        let cp1x = sx, cp1y = sy, cp2x = ex, cp2y = ey;

        switch(startPos) {
            case 'top': cp1y -= curvature; break;
            case 'bottom': cp1y += curvature; break;
            case 'left': cp1x -= curvature; break;
            case 'right': cp1x += curvature; break;
        }

        if (endPos) {
            switch(endPos) {
                case 'top': cp2y -= curvature; break;
                case 'bottom': cp2y += curvature; break;
                case 'left': cp2x -= curvature; break;
                case 'right': cp2x += curvature; break;
            }
        } else {
            cp2y = ey; 
        }

        return `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`;
    }

    /*******************************************************
     * GENERIC DRAG LOGIC
     *******************************************************/
    function setupDraggable(element, type) {
        let startX = 0;
        let startY = 0;

        interact(element).draggable({
            enabled: type !== 'frame', 
            ignoreFrom: '.flow-handle, .note-textarea, input, .dropdown-item, i.fa-ellipsis, .task-item, .delete-btn, .new-item-input', 
            modifiers: [interact.modifiers.restrictRect({ restriction: workspace })],
            listeners: {
                start(event) {
                    isMovingElement = true;
                    element.style.zIndex = 100;
                    if (type === 'frame') element.classList.add('ring-1', 'ring-blue-500', 'ring-offset-2');
                    startX = parseFloat(element.style.left) || 0;
                    startY = parseFloat(element.style.top) || 0;
                },
                move(event) {
                    const x = (parseFloat(element.getAttribute('data-x')) || 0) + (event.dx / currentScale);
                    const y = (parseFloat(element.getAttribute('data-y')) || 0) + (event.dy / currentScale);
                    element.style.transform = `translate(${x}px, ${y}px)`;
                    element.setAttribute('data-x', x);
                    element.setAttribute('data-y', y);
                    
                    if (type === 'flowNode') updateEdges();
                },
                end(event) {
                    element.style.zIndex = '';
                    if (type === 'frame') {
                        element.classList.remove('ring-1', 'ring-blue-500', 'ring-offset-2');
                        interact(element).draggable({ enabled: false });
                        element.classList.remove('interact-draggable-enabled');
                    }
                    isMovingElement = false;

                    const dx = parseFloat(element.getAttribute('data-x')) || 0;
                    const dy = parseFloat(element.getAttribute('data-y')) || 0;
                    const finalX = parseFloat(element.style.left) + dx;
                    const finalY = parseFloat(element.style.top) + dy;

                    element.style.left = `${finalX}px`;
                    element.style.top = `${finalY}px`;
                    element.style.transform = ''; 
                    element.removeAttribute('data-x');
                    element.removeAttribute('data-y');

                    if (type === 'note') reparentNote(element);
                    if (type === 'flowNode') updateEdges();

                    if (Math.abs(finalX - startX) > 1 || Math.abs(finalY - startY) > 1) {
                        pushHistory({
                            type: 'MOVE_ELEMENT',
                            elementType: type,
                            element: element,
                            oldX: startX,
                            oldY: startY,
                            newX: finalX,
                            newY: finalY
                        });
                    }
                }
            }
        });
    }


    /***********************
     * STICKY NESTING LOGIC
     ***********************/
    function reparentNote(noteElement) {
        const rect = noteElement.getBoundingClientRect();
        const elementCenterX = rect.left + rect.width / 2;
        const elementCenterY = rect.top + rect.height / 2;
        let newParent = workspace; 

        const topLevelFrames = frames.map(f => f.element);
        for (let i = topLevelFrames.length - 1; i >= 0; i--) {
            const frame = topLevelFrames[i];
            if (frame === noteElement.parentElement) continue;
            const frameRect = frame.getBoundingClientRect();
            if (elementCenterX > frameRect.left && elementCenterX < frameRect.right &&
                elementCenterY > frameRect.top && elementCenterY < frameRect.bottom) {
                newParent = frame;
                break;
            }
        }

        const oldParent = noteElement.parentElement;
        if (newParent !== oldParent) {
            const elementXViewport = rect.left;
            const elementYViewport = rect.top;
            const newParentRect = newParent.getBoundingClientRect();
            const newX = (elementXViewport - newParentRect.left) / currentScale;
            const newY = (elementYViewport - newParentRect.top) / currentScale;

            newParent.appendChild(noteElement);
            noteElement.style.left = `${newX}px`;
            noteElement.style.top = `${newY}px`;
        }
        
        interact(noteElement).draggable({
            modifiers: [interact.modifiers.restrictRect({ restriction: noteElement.parentElement })],
        });
    }

    /***********************
     * FRAME CREATION
     ***********************/
    function createFrame(x, y, width, height, title, id = null) {
        const frameId = id || Date.now();
        const frame = document.createElement('div');
        frame.className = 'canvas-frame';
        frame.style.left = `${x}px`;
        frame.style.top = `${y}px`;
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        frame.dataset.id = frameId;

        const header = document.createElement('div');
        header.className = 'frame-header';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = title;
        titleInput.className = 'frame-title-input';
        titleInput.placeholder = 'Board Title';
        titleInput.addEventListener('input', updateTracker); 

        header.appendChild(titleInput);

        const plus = document.createElement('i');
        plus.className = 'relative fas fa-plus -z-10 text-gray-400 hover:text-blue-500 cursor-pointer';
        plus.title = 'Add New Board';
        plus.onclick = (e) => { e.stopPropagation(); addFrame(); };
        header.appendChild(plus);
        frame.appendChild(header);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.className = 'absolute inset-0 w-full h-full';
        frame.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penSize;
        let drawing = false;
        let snapshot = null;

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return { 
                x: (e.clientX - rect.left) * scaleX, 
                y: (e.clientY - rect.top) * scaleY 
            };
        }

        canvas.addEventListener('mousedown', e => {
            if (!['pen', 'eraser'].includes(activeTool) || isMovingElement) return;
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { x, y } = getMousePos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            drawing = true;
        });

        canvas.addEventListener('mousemove', e => {
            if (!drawing || isMovingElement) return;
            const { x, y } = getMousePos(e);
            if (activeTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = eraserSize;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = penColor;
                ctx.lineWidth = penSize;
            }
            ctx.lineTo(x, y);
            ctx.stroke();
        });

        const endStroke = () => {
            if (drawing) {
                drawing = false;
                ctx.closePath();
                saveDrawingToLocalStorage(frameId, canvas);
                
                const newSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
                pushHistory({
                    type: 'DRAW',
                    frameId: frameId,
                    canvas: canvas,
                    before: snapshot,
                    after: newSnapshot
                });
            }
        };

        canvas.addEventListener('mouseup', endStroke);
        canvas.addEventListener('mouseleave', endStroke);
        
        frame.addEventListener('click', (e) => {
            if (activeTool === 'mouse') {
                document.querySelectorAll('.canvas-frame').forEach(f => f.classList.remove('ring-blue-500'));
                frame.classList.add('ring-blue-500');
                e.stopPropagation();
            }
        });

        setupDraggable(frame, 'frame');

        frame.addEventListener('dblclick', (e) => {
            if (activeTool !== 'mouse') return;
            if (e.target !== frame && e.target !== canvas) return;
            interact(frame).draggable({ enabled: true });
            frame.classList.add('interact-draggable-enabled');
            e.stopPropagation(); 
        });
        
        interact(frame).resizable({
            edges: { left: true, right: true, bottom: true, top: true },
        }).on('resizemove', event => {
            const delta = event.deltaRect;
            const newW = parseFloat(frame.style.width) + (delta.width / currentScale);
            const newH = parseFloat(frame.style.height) + (delta.height / currentScale);

            if (delta.left !== 0) {
                 const newLeft = parseFloat(frame.style.left) + (delta.left / currentScale);
                 frame.style.left = `${newLeft}px`;
            }
            if (delta.top !== 0) {
                 const newTop = parseFloat(frame.style.top) + (delta.top / currentScale);
                 frame.style.top = `${newTop}px`;
            }

            const oldWidth = canvas.width;
            const oldHeight = canvas.height;
            
            frame.style.width = `${newW}px`;
            frame.style.height = `${newH}px`;
            
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = oldWidth;
            tempCanvas.height = oldHeight;
            tempCtx.drawImage(canvas, 0, 0);

            canvas.width = newW;
            canvas.height = newH;
            ctx.drawImage(tempCanvas, 0, 0, oldWidth, oldHeight);
            saveDrawingToLocalStorage(frameId, canvas);
        });

        const frameData = { id: frameId, x, y, width, height, title, element: frame };
        workspace.appendChild(frame);
        frames.push(frameData);
        
        loadDrawingFromLocalStorage(frameId, canvas, ctx);
        updateTracker();
        return frameData;
    }

    function addFrame() {
        const width = 600, height = 400;
        const center = getCenterPos();
        const x = center.x - width / 2 + (Math.random() * 100 - 50);
        const y = center.y - height / 2 + (Math.random() * 100 - 50);
        
        const newFrame = createFrame(x, y, width, height, `Board ${frames.length + 1}`);
        
        pushHistory({
            type: 'ADD_ELEMENT',
            elementType: 'frame',
            id: newFrame.id,
            element: newFrame.element,
            parent: workspace
        });
    }

    /***********************
     * STICKY NOTES
     ***********************/
    function addStickyNote(parent = workspace, id = null, content = 'Infinite canvas that feels native.', loadX=null, loadY=null, sprint=null) {
        const isNested = parent !== workspace;
        const width = 240; 
        const height = 240; 
        let x, y;

        if (loadX !== null && loadY !== null) {
            x = loadX;
            y = loadY;
        } else if (isNested) {
            x = 10 + (Math.random() * 50);
            y = 10 + (Math.random() * 50);
        } else {
            const center = getCenterPos();
            x = center.x - width / 2 + (Math.random() * 100 - 50);
            y = center.y - height / 2 + (Math.random() * 100 - 50);
        }

        const noteId = id || Date.now();

        // Removed hover:shadow-md, added hover:shadow-none as requested
        const note = document.createElement('div');
        note.className = 'absolute w-64 bg-[#FFFCF0] border border-yellow-200/60 rounded-2xl p-5 flex flex-col gap-3 group shadow-sm hover:shadow-none transition-shadow select-none';
        note.style.left = `${x}px`;
        note.style.top = `${y}px`;
        note.dataset.id = noteId;
        if (sprint) note.dataset.sprint = sprint;

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between border-b border-yellow-100/80 pb-3';
        
        // Label
        const labelGroup = document.createElement('div');
        labelGroup.className = 'flex items-center gap-2';
        labelGroup.innerHTML = `
            <div class="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
            <span class="text-[10px] uppercase font-bold text-yellow-700/40 tracking-widest">Idea</span>
        `;
        header.appendChild(labelGroup);

        // Menu (Ellipsis) with Dropdown Trigger
        const menuContainer = document.createElement('div');
        menuContainer.className = 'relative';
        const menuBtn = document.createElement('i');
        menuBtn.className = 'fa-solid fa-ellipsis text-yellow-300 text-sm cursor-pointer hover:text-yellow-500 transition-colors';
        menuContainer.appendChild(menuBtn);

        // Dropdown Menu
        const dropdown = document.createElement('div');
        dropdown.className = 'absolute top-full right-0 mt-2 w-36 bg-white border border-gray-100 rounded-xl shadow-xl z-50 hidden flex-col py-1 animate-fade-in-out origin-top-right';
        dropdown.style.animation = 'none'; // reset
        
        const createDropdownItem = (text, onClick) => {
            const item = document.createElement('div');
            item.className = 'dropdown-item px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-2';
            item.innerText = text;
            item.onclick = (e) => {
                e.stopPropagation();
                onClick();
                dropdown.classList.add('hidden');
            };
            return item;
        };

        const updateSprintTag = (newSprint) => {
            note.dataset.sprint = newSprint;
            if(newSprint) {
                sprintTag.innerText = `#${newSprint}`;
                sprintTag.classList.remove('hidden');
            } else {
                delete note.dataset.sprint;
                sprintTag.classList.add('hidden');
            }
            updateTracker();
        };

        dropdown.appendChild(createDropdownItem('Assign to Sprint 1', () => updateSprintTag('Sprint 1')));
        dropdown.appendChild(createDropdownItem('Assign to Sprint 2', () => updateSprintTag('Sprint 2')));
        dropdown.appendChild(createDropdownItem('Assign to Sprint 3', () => updateSprintTag('Sprint 3')));
        dropdown.appendChild(createDropdownItem('Clear Sprint', () => updateSprintTag(null)));
        
        const deleteDivider = document.createElement('div');
        deleteDivider.className = 'h-[1px] bg-gray-100 my-1';
        dropdown.appendChild(deleteDivider);

        const deleteItem = createDropdownItem('Delete Note', () => {
            note.remove();
            notes = notes.filter(n => n.dataset.id != noteId);
            updateTracker();
        });
        deleteItem.classList.add('text-red-500', 'hover:bg-red-50');
        dropdown.appendChild(deleteItem);

        menuContainer.appendChild(dropdown);
        header.appendChild(menuContainer);

        // Toggle Dropdown
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(d => {
                 if(d !== dropdown) d.classList.add('hidden');
            });
            dropdown.classList.toggle('hidden');
        };
        
        document.addEventListener('click', (e) => {
            if(!menuContainer.contains(e.target)) dropdown.classList.add('hidden');
        });

        note.appendChild(header);

        // --- Content (Textarea styled as P) ---
        const textarea = document.createElement('textarea');
        textarea.className = 'note-textarea w-full h-full min-h-[80px] bg-transparent resize-none outline-none text-xl font-medium text-gray-800 leading-[1.2] py-1 placeholder-yellow-700/20 pointer-events-none';
        textarea.value = content;
        textarea.placeholder = "Write your idea...";
        
        note.addEventListener('dblclick', (e) => {
            if (e.target.closest('.fa-ellipsis') || e.target.closest('.dropdown-item')) return;
            
            textarea.classList.remove('pointer-events-none');
            textarea.focus();
            const val = textarea.value;
            textarea.value = '';
            textarea.value = val;
        });

        textarea.addEventListener('blur', () => {
            textarea.classList.add('pointer-events-none');
            updateTracker();
        });

        note.appendChild(textarea);

        // --- Footer ---
        const footer = document.createElement('div');
        footer.className = 'flex items-center justify-between pt-2 mt-auto';
        
        const sprintTag = document.createElement('div');
        sprintTag.className = 'px-2 py-0.5 bg-yellow-100/50 rounded-md border border-yellow-200/30 text-[10px] font-semibold text-yellow-700';
        if (sprint) {
            sprintTag.innerText = `#${sprint}`;
        } else {
            sprintTag.classList.add('hidden');
        }
        footer.appendChild(sprintTag);

        const avatar = document.createElement('div');
        avatar.className = 'w-5 h-5 rounded-full bg-yellow-200 flex items-center justify-center text-[9px] font-bold text-yellow-700 shadow-sm';
        avatar.innerText = 'YOU';
        footer.appendChild(avatar);

        note.appendChild(footer);

        parent.appendChild(note);
        notes.push(note);

        setupDraggable(note, 'note');

        if (!id) {
            pushHistory({
                type: 'ADD_ELEMENT',
                elementType: 'note',
                id: noteId,
                element: note,
                parent: parent
            });
        }
        updateTracker();
    }

    /***********************
     * INITIALIZATION
     ***********************/
    function centerDefaultFrame() {
        const width = 800, height = 500;
        const centerX = (14000 - width) / 2;
        const centerY = (14000 - height) / 2;
        const newFrame = createFrame(centerX, centerY, width, height, 'Board 1');
        
        const containerWidth = scrollContainer.clientWidth;
        const containerHeight = scrollContainer.clientHeight;
        scrollContainer.scrollLeft = centerX - containerWidth / 2 + width / 2;
        scrollContainer.scrollTop = centerY - containerHeight / 2 + height / 2;
    }

    document.addEventListener('click', (e) => {
        if (e.target === workspace || e.target === scrollContainer || e.target.id === 'edges-layer') {
             document.querySelectorAll('.canvas-frame').forEach(f => f.classList.remove('ring-blue-500'));
        }
    });

    function init() {
        const savedDrawings = localStorage.getItem(DRAWING_STORAGE_KEY);
        if (savedDrawings) drawingsData = JSON.parse(savedDrawings);
        
        // Attempt to load board state
        const loaded = loadBoardState();
        
        if (!loaded) {
            centerDefaultFrame();
        } else {
            // If loaded, scroll to center of workspace as default or maybe first frame
            // For now, center of 14000x14000
            const containerWidth = scrollContainer.clientWidth;
            const containerHeight = scrollContainer.clientHeight;
            scrollContainer.scrollLeft = 14000/2 - containerWidth/2;
            scrollContainer.scrollTop = 14000/2 - containerHeight/2;
        }

        customCursor.style.display = 'block';
        const boardContainer = document.getElementById('board-container');
        if (boardContainer) boardContainer.classList.add('no-cursor');
        
        // Settings init
        initSettings();

        updateUndoRedoUI();
        // Init tracker UI
        renderTrackerSidebar();
        updateTracker();
    }

    /***********************
     * CUSTOM CURSOR
     ***********************/
    let cursorPos = { x: 0, y: 0 };
    document.addEventListener('mousemove', e => {
        cursorPos = { x: e.clientX, y: e.clientY };
        customCursor.style.left = `${cursorPos.x}px`;
        customCursor.style.top = `${cursorPos.y}px`;

        if (activeTool === 'mouse') {
           customCursor.className = 'fas fa-location-arrow custom-cursor text-[#1a1a1a] opacity-100';
            customCursor.style.transform = 'rotate(-90deg)';
        } else if (activeTool === 'eraser') {
            customCursor.className = 'fas fa-location-arrow custom-cursor text-[#1a1a1a] opacity-100';
            customCursor.style.transform = 'rotate(-90deg)';
        } else {
            customCursor.className = 'fas fa-location-arrow custom-cursor text-[#1a1a1a] opacity-100';
            customCursor.style.transform = 'rotate(-90deg)';
        }

        if (isMovingElement) {
            customCursor.className = 'fas fa-arrows-alt custom-cursor text-blue-500 opacity-100';
            customCursor.style.transform = '';
        }
    });

    document.addEventListener('mousedown', () => { 
        customCursor.style.transform += ' scale(0.9)'; 
    });
    
    document.addEventListener('mouseup', () => { 
        customCursor.style.transform = customCursor.style.transform.replace(' scale(0.9)', ''); 
    });

    // Initialize when script loads
    init();
}
