/************************************************************
 * INFINITE WHITEBOARD IMPLEMENTATION WITH SOCKET.IO
 ************************************************************/

window.initBoard = function() {
    // Wrap everything in IIFE to avoid global scope pollution
    
    // --- SOCKET.IO SETUP ---
    let socket;
    let boardId = 'default-room';
    let isRemoteUpdate = false;
    let userRole = 'guest';

    // --- USER PERSONA SETUP (Cursors) ---
    // Updated to use fa-location-arrow and -90deg rotation for all
    const USER_PERSONAS = [
        { name: 'Alex', color: '#5C1F1F', bg: '#ffc9c9', icon: 'fa-solid fa-location-arrow', iconColor: '#ffc9c9', rotation: -90 },
        { name: 'Leo', color: '#444', bg: '#dce8ff', icon: 'fa-solid fa-location-arrow', iconColor: '#ccdeff', rotation: -90 },
        { name: 'Maya', color: '#2E2172', bg: '#e2d5ff', icon: 'fa-solid fa-location-arrow', iconColor: '#e2d5ff', rotation: -90 },
        { name: 'Sofia', color: '#214B2A', bg: '#cbffd1', icon: 'fa-solid fa-location-arrow', iconColor: '#a6feb0', rotation: -90 }
    ];

    // Pick random persona or deterministically based on something
    const myPersonaIndex = Math.floor(Math.random() * USER_PERSONAS.length);
    const myPersona = USER_PERSONAS[myPersonaIndex];
    const myUserId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    // Parse URL Parameters
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
        boardId = params.get('room');
    }
    if (params.get('role')) {
        userRole = params.get('role');
    }
    // Override name if passed in URL
    if (params.get('name')) {
        myPersona.name = decodeURIComponent(params.get('name'));
    }

    // Initialize socket if available
    if (typeof io !== 'undefined') {
        try {
            socket = io();
            console.log('✅ Socket.IO initialized for Room:', boardId);
            
            // Join specific room
            socket.emit('join', boardId);
            
            socket.on('board:update', (data) => {
                // Flag to prevent infinite loops (remote update -> emit -> remote update ...)
                isRemoteUpdate = true;
                handleRemoteUpdate(data);
                isRemoteUpdate = false;
            });
        } catch (e) {
            console.error('Socket connection failed:', e);
        }
    }

    const emitUpdate = (type, data) => {
        if (socket && !isRemoteUpdate) {
            socket.emit('board:update', { boardId, type, userId: myUserId, ...data });
        }
    };

    // --- Helper: Throttling for Real-time Updates ---
    function throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function() {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        }
    }

    // Throttled Emitters
    const throttledMoveEmit = throttle((id, x, y) => {
        emitUpdate('MOVE', { id, x, y });
    }, 30); // ~30ms update rate

    const throttledResizeEmit = throttle((id, w, h, image = null) => {
        // We only send image if provided (end of resize), otherwise just dims
        emitUpdate('RESIZE', { id, elementType: 'frame', w, h, image }); 
    }, 50);

    const throttledCursorEmit = throttle((x, y) => {
        emitUpdate('CURSOR_MOVE', { 
            x, 
            y, 
            persona: myPersona 
        });
    }, 12);

    // --- CRITICAL: Namespace Storage keys with boardId to separate rooms ---
    const DRAWING_STORAGE_KEY = `whiteboardDrawings_${boardId}`;
    const BOARD_STATE_KEY = `whiteboardState_${boardId}`;

    const workspace = document.getElementById('workspace');
    const scrollContainer = document.getElementById('scrollContainer');
    const customCursor = document.getElementById('customCursor');
    const edgesSvg = document.getElementById('edges-layer');
    const contextMenu = document.getElementById('context-menu');

    // Update Utility Bar with Room Info
    const roomInfoDisplay = document.getElementById('room-info-display');
    const roomIdDisplay = document.getElementById('room-id-display');
    if (roomIdDisplay) {
        roomIdDisplay.innerText = `Board Code: ${boardId}`;
    }

    if (!workspace || !scrollContainer || !customCursor || !edgesSvg) {
        console.error('Board elements not found in DOM. Cannot initialize.');
        return;
    }

    console.log('✅ Board elements found, initializing...');
    
    // --- Global Popup Functions (Exposed for other scripts) ---
    window.showCustomAlert = function(title, message, type = 'info') {
        const alertEl = document.getElementById('custom-alert');
        const titleEl = document.getElementById('custom-alert-title');
        const msgEl = document.getElementById('custom-alert-msg');
        const iconEl = document.getElementById('custom-alert-icon');
        
        if (!alertEl) return;
        
        titleEl.innerText = title;
        msgEl.innerText = message;
        
        // Icon styling
        iconEl.className = 'w-10 h-10 rounded-full flex items-center justify-center text-white ' + (type === 'success' ? 'bg-green-500' : 'bg-blue-500');
        iconEl.innerHTML = type === 'success' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-info"></i>';

        alertEl.classList.remove('hidden');
        alertEl.classList.add('flex');
        
        // Auto hide after 3s
        setTimeout(() => {
            alertEl.classList.add('hidden');
            alertEl.classList.remove('flex');
        }, 3000);
    };

    window.showInputModal = function(title, placeholder, callback) {
        const modal = document.getElementById('input-modal');
        const titleEl = document.getElementById('input-modal-title');
        const inputEl = document.getElementById('input-modal-field');
        const confirmBtn = document.getElementById('input-modal-confirm');
        const cancelBtn = document.getElementById('input-modal-cancel');
        
        if (!modal) return;
        
        titleEl.innerText = title;
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        inputEl.focus();
        
        const close = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            inputEl.onkeydown = null;
            confirmBtn.onclick = null;
        };
        
        confirmBtn.onclick = () => {
            if (inputEl.value.trim()) {
                callback(inputEl.value.trim());
                close();
            }
        };
        
        cancelBtn.onclick = close;
        
        // Handle enter key
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter' && inputEl.value.trim()) {
                callback(inputEl.value.trim());
                close();
            } else if (e.key === 'Escape') {
                close();
            }
        };
    };

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
    const addFolderBtn = document.getElementById('add-folder-btn');

    /***********************
     * HISTORY UI ELEMENTS
     ***********************/
    const historyTracker = document.getElementById('history-tracker');
    const historyTooltip = document.getElementById('history-tooltip');


    /***********************
     * SETTINGS & POPUP ELEMENTS
     ***********************/
    const settingsModal = document.getElementById('settings-modal');
    const settingsCard = document.getElementById('settings-card');
    const settingsBackdrop = document.getElementById('settings-backdrop');
    const gearIcon = document.getElementById('gear-icon');
    const closeSettingsBtn = document.getElementById('close-settings');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    
    const shareBtn = document.getElementById('share-btn');
    const sharePopup = document.getElementById('share-popup');
    const closeShareBtn = document.getElementById('close-share');
    const sharePlusBtn = document.getElementById('share-plus-btn');
    
    const userIcon = document.getElementById('user-icon');
    const userPopup = document.getElementById('user-popup');

    /***********************
     * STATE VARIABLES
     ***********************/
    let frames = []; 
    let notes = []; 
    let flowNodes = []; // Store flow nodes
    let sprintLists = []; // Store sprint task lists
    let edges = []; // Store connections: { id, startNodeId, startHandle, endNodeId, endHandle, pathEl }
    let folders = []; // { id, name, collapsed }
    let remoteCursors = {}; // { userId: { element: DOMElement, timeout: Timer } }
    
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
     * REMOTE UPDATE LOGIC
     ***********************/
    function handleRemoteUpdate(data) {
        // Ignore own updates if they ever loop back
        if (data.userId === myUserId) return;

        try {
            if (data.type === 'CURSOR_MOVE') {
                updateRemoteCursor(data);
            } else if (data.type === 'SAVE_TRIGGER') {
                performSaveUI(); // Run save logic without emitting
            } else if (data.type === 'MOVE') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el) {
                    // Update position
                    el.style.left = data.x + 'px';
                    el.style.top = data.y + 'px';
                    
                    if (el.dataset.type) updateEdges();
                }
            } else if (data.type === 'DRAW_POINT') {
                // Real-time drawing segment
                const frame = frames.find(f => f.id == data.frameId);
                if (frame) {
                    const canvas = frame.element.querySelector('canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.globalCompositeOperation = data.tool === 'eraser' ? 'destination-out' : 'source-over';
                    ctx.strokeStyle = data.color;
                    ctx.lineWidth = data.size;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(data.prevX, data.prevY);
                    ctx.lineTo(data.x, data.y);
                    ctx.stroke();
                }
            } else if (data.type === 'DRAW') {
                // Final draw update (full image)
                const frame = frames.find(f => f.id == data.frameId);
                if (frame) {
                    const canvas = frame.element.querySelector('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = () => {
                        ctx.globalCompositeOperation = 'source-over'; // Reset GCO to ensure image draws correctly
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        saveDrawingToLocalStorage(data.frameId, canvas);
                    };
                    img.src = data.image;
                }
            } else if (data.type === 'ADD') {
                if (data.elementType === 'note') {
                    if(!document.querySelector(`[data-id="${data.data.id}"]`))
                        addStickyNote(workspace, data.data.id, data.data.content, data.data.x, data.data.y, data.data.sprint, data.data.color);
                } else if (data.elementType === 'frame') {
                    if(!frames.find(f => f.id == data.data.id))
                        createFrame(data.data.x, data.data.y, data.data.w, data.data.h, data.data.title, data.data.id);
                } else if (data.elementType === 'flowNode') {
                    if(!flowNodes.find(n => n.dataset.id == data.data.id))
                        createFlowNode(data.data.type, data.data.id, data.data.x, data.data.y, data.data.text);
                } else if (data.elementType === 'sprintList') {
                    if(!sprintLists.find(l => l.id == data.data.id))
                        addSprintList(data.data.x, data.data.y, data.data.id, data.data);
                }
            } else if (data.type === 'DELETE') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el) {
                    deleteElement({ id: data.id, type: data.elementType, el: el }, true);
                }
            } else if (data.type === 'ADD_EDGE') {
                 if(!edges.find(e => e.id == data.edge.id))
                    createEdge(data.edge.sourceNodeId, data.edge.sourceHandle, data.edge.targetNodeId, data.edge.targetHandle, data.edge.id);
            } 
            // Sprint List Specific Updates
            else if (data.type === 'TASK_UPDATE') {
                const list = sprintLists.find(l => l.id == data.listId);
                if (list && list.items[data.taskIdx]) {
                    list.items[data.taskIdx].completed = data.completed;
                    const listEl = document.querySelector(`.sprint-list[data-id="${data.listId}"]`);
                    if(listEl) {
                        const checkDiv = listEl.querySelector(`.task-item[data-idx="${data.taskIdx}"] .check-trigger`);
                        const input = listEl.querySelector(`.task-item[data-idx="${data.taskIdx}"] input`);
                        
                        if(checkDiv && input) {
                            const isChecked = data.completed;
                            if(isChecked) {
                                checkDiv.className = 'w-5 h-5 bg-indigo-500 rounded-[6px] flex items-center justify-center shrink-0 transition-transform check-trigger';
                                checkDiv.innerHTML = '<i class="fa-solid fa-check text-white text-[10px]" style="stroke-width: 3px;"></i>';
                                input.classList.add('text-gray-400', 'line-through', 'decoration-gray-200');
                                input.classList.remove('text-gray-700');
                            } else {
                                checkDiv.className = 'w-5 h-5 bg-white border-[1.5px] border-gray-300 rounded-[6px] flex items-center justify-center shrink-0 transition-transform check-trigger';
                                checkDiv.innerHTML = '';
                                input.classList.remove('text-gray-400', 'line-through', 'decoration-gray-200');
                                input.classList.add('text-gray-700');
                            }
                        }
                    }
                }
            } else if (data.type === 'TASK_EDIT') {
                const list = sprintLists.find(l => l.id == data.listId);
                if (list && list.items[data.taskIdx]) {
                    list.items[data.taskIdx].text = data.text;
                    const input = document.querySelector(`.sprint-list[data-id="${data.listId}"] .task-item[data-idx="${data.taskIdx}"] input`);
                    if(input) input.value = data.text;
                }
            } else if (data.type === 'TASK_ADD') {
                const list = sprintLists.find(l => l.id == data.listId);
                if (list) {
                    list.items.push(data.newItem);
                    // Fully re-render list container to show new item
                    const listEl = document.querySelector(`.sprint-list[data-id="${data.listId}"]`);
                    if(listEl) {
                        const x = listEl.style.left;
                        const y = listEl.style.top;
                        listEl.remove();
                        addSprintList(parseFloat(x), parseFloat(y), data.listId, list);
                    }
                }
            } else if (data.type === 'NOTE_EDIT') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el) {
                    const textarea = el.querySelector('textarea');
                    if (textarea) textarea.value = data.content;
                }
            } else if (data.type === 'NOTE_UPDATE') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el) {
                    if (data.color) {
                        el.dataset.color = data.color;
                    }
                    if (data.sprint !== undefined) {
                         if (data.sprint) {
                             el.dataset.sprint = data.sprint;
                         } else {
                             delete el.dataset.sprint;
                         }
                         
                         // SYNC: Find sprint tag by class
                         const sprintTag = el.querySelector('.sprint-tag');
                         if (sprintTag) {
                             if (data.sprint) {
                                 sprintTag.innerText = `#${data.sprint}`;
                                 sprintTag.classList.remove('hidden');
                             } else {
                                 sprintTag.classList.add('hidden');
                             }
                         }
                    }
                    updateTracker();
                }
            } else if (data.type === 'NODE_EDIT') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el) {
                    const span = el.querySelector('span');
                    if (span) span.innerText = data.text;
                }
            } else if (data.type === 'RESIZE') {
                const el = document.querySelector(`[data-id="${data.id}"]`);
                if (el && data.elementType === 'frame') {
                    // Update Dimensions
                    el.style.width = data.w + 'px';
                    el.style.height = data.h + 'px';
                    
                    // Update frame data array
                    const frameData = frames.find(f => f.id == data.id);
                    if(frameData) {
                        frameData.width = data.w;
                        frameData.height = data.h;
                    }
                    
                    // Sync Canvas
                    const canvas = el.querySelector('canvas');
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        
                        // If data.image is provided (Resize End), use it
                        if (data.image) {
                            const img = new Image();
                            img.onload = () => {
                                canvas.width = data.w;
                                canvas.height = data.h;
                                ctx.drawImage(img, 0, 0);
                                saveDrawingToLocalStorage(data.id, canvas);
                            };
                            img.src = data.image;
                        } 
                        // If no image (Real-time Resize), avoid scaling to prevent distortion/blur
                        else {
                             // Create a temporary canvas with current content
                             const tempCanvas = document.createElement('canvas');
                             tempCanvas.width = canvas.width;
                             tempCanvas.height = canvas.height;
                             tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
                             
                             // Resize actual canvas
                             canvas.width = data.w;
                             canvas.height = data.h;
                             
                             // Draw image back at 0,0 without stretching
                             ctx.drawImage(tempCanvas, 0, 0);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Remote update error", err);
        }
    }

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
     * TRACKER LOGIC WITH FOLDERS
     ***********************/
    let isTrackerOpen = false;

    function createFolder() {
        window.showInputModal("Create New Folder", "Folder Name", (name) => {
             folders.push({ id: 'folder-' + Date.now(), name: name, collapsed: false });
             updateTracker();
             window.showCustomAlert("Success", `Folder "${name}" created`, "success");
        });
    }

    if(addFolderBtn) addFolderBtn.onclick = createFolder;

    function updateTracker() {
        if (!trackerList) return;
        
        trackerList.innerHTML = '';
        
        // Update Counts
        if (countFrames) countFrames.innerText = frames.length;
        if (countNotes) countNotes.innerText = notes.length;
        if (countNodes) countNodes.innerText = flowNodes.length;

        const allItems = [];
        
        // Collect all items
        frames.forEach(f => {
            allItems.push({
                type: 'frame',
                id: f.id,
                icon: 'fa-solid fa-crop-simple',
                color: 'bg-blue-600',
                text: f.element.querySelector('.frame-title-input').value || 'Untitled Board',
                folderId: f.folderId
            });
        });
        sprintLists.forEach(l => {
            allItems.push({
                type: 'list',
                id: l.id,
                icon: 'fa-solid fa-list-check',
                color: 'bg-indigo-600',
                text: l.title || 'Sprint Tasks',
                folderId: l.folderId
            });
        });
        notes.forEach(n => {
            allItems.push({
                type: 'note',
                id: n.dataset.id,
                icon: 'fa-solid fa-note-sticky',
                color: 'bg-yellow-500',
                text: n.querySelector('textarea').value.substring(0, 20) || 'Empty Note',
                folderId: n.dataset.folderId
            });
        });
        flowNodes.forEach(n => {
            let icon = 'fa-regular fa-circle';
            let col = 'bg-emerald-600';
            if(n.dataset.type === 'rect') { icon = 'fa-regular fa-square'; col = 'bg-blue-600'; }
            if(n.dataset.type === 'diamond') { icon = 'fa-solid fa-diamond'; col = 'bg-purple-600'; }
            allItems.push({
                type: 'node',
                id: n.dataset.id,
                icon: icon,
                color: col,
                text: n.querySelector('span').innerText || 'Node',
                folderId: n.dataset.folderId
            });
        });

        const renderItem = (item, container) => {
            const el = document.createElement('div');
            el.className = 'flex items-center gap-2 p-2 rounded-xl bg-[#2b3037] border border-gray-700 hover:bg-gray-700 transition cursor-grab group';
            el.draggable = true;
            
            // Drag Data
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ itemId: item.id, itemType: item.type }));
            });

            const iconDiv = document.createElement('div');
            iconDiv.className = `w-6 h-6 rounded-md flex items-center justify-center ${item.color} text-white text-xs shrink-0`;            
            iconDiv.innerHTML = `<i class="${item.icon}"></i>`;
            
            const span = document.createElement('span');
            span.className = 'text-xs text-gray-300 truncate flex-1';
            span.innerText = item.text;

            const btnLocate = document.createElement('button');
            btnLocate.className = 'text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity';
            btnLocate.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            btnLocate.title = "Locate on Board";
            btnLocate.onclick = (e) => {
                e.stopPropagation();
                locateElement(item.id);
            };

            el.appendChild(iconDiv);
            el.appendChild(span);
            el.appendChild(btnLocate);
            container.appendChild(el);
        };

        // Render Folders
        folders.forEach(folder => {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'mb-2';
            
            const header = document.createElement('div');
            header.className = 'flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors';
            header.innerHTML = `
                <i class="fa-solid fa-chevron-down text-[10px] folder-chevron ${folder.collapsed ? 'collapsed' : ''}"></i>
                <i class="fa-regular fa-folder text-xs"></i>
                <span class="text-xs font-bold uppercase tracking-wide flex-1 select-none">${folder.name}</span>
            `;
            
            // Folder Toggle
            header.onclick = () => {
                folder.collapsed = !folder.collapsed;
                updateTracker();
            };

            // Drop Target Logic
            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                header.classList.add('drag-over-folder');
            });
            header.addEventListener('dragleave', () => {
                header.classList.remove('drag-over-folder');
            });
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                header.classList.remove('drag-over-folder');
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                assignToFolder(data.itemId, data.itemType, folder.id);
            });

            folderDiv.appendChild(header);

            const content = document.createElement('div');
            content.className = `folder-content pl-2 space-y-1 mt-1 border-l-2 border-gray-800 ml-2 ${folder.collapsed ? 'collapsed' : ''}`;
            
            // Find items in this folder
            const folderItems = allItems.filter(i => i.folderId === folder.id);
            folderItems.forEach(item => renderItem(item, content));
            
            folderDiv.appendChild(content);
            trackerList.appendChild(folderDiv);
        });

        // Unassigned items
        const unassigned = allItems.filter(i => !i.folderId);
        if (unassigned.length > 0) {
            const header = document.createElement('div');
            header.className = 'text-[10px] uppercase font-bold text-gray-500 mt-3 mb-1 px-2 tracking-wider';
            header.innerText = 'Unassigned';
            trackerList.appendChild(header);
            unassigned.forEach(item => renderItem(item, trackerList));
        }
    }

    function assignToFolder(itemId, type, folderId) {
        if (type === 'frame') {
            const f = frames.find(x => x.id == itemId);
            if(f) f.folderId = folderId;
        } else if (type === 'list') {
            const l = sprintLists.find(x => x.id == itemId);
            if(l) l.folderId = folderId;
        } else if (type === 'note') {
            const n = notes.find(x => x.dataset.id == itemId);
            if(n) n.dataset.folderId = folderId;
        } else if (type === 'node') {
            const n = flowNodes.find(x => x.dataset.id == itemId);
            if(n) n.dataset.folderId = folderId;
        }
        updateTracker();
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
     * SETTINGS, POPUPS & THEME LOGIC
     ***********************/
    function initSettingsAndPopups() {
        // Generic Popup Toggler
        const toggle = (modal, show) => {
            if (show) {
                modal.classList.remove('hidden');
                if(modal.id === 'settings-modal') {
                    modal.classList.remove('opacity-0', 'pointer-events-none');
                    settingsCard.classList.remove('scale-95');
                    settingsCard.classList.add('scale-100');
                }
            } else {
                if(modal.id === 'settings-modal') {
                     modal.classList.add('opacity-0', 'pointer-events-none');
                     settingsCard.classList.remove('scale-100');
                     settingsCard.classList.add('scale-95');
                } else {
                    modal.classList.add('hidden');
                }
            }
        };

        // Settings
        if (gearIcon) gearIcon.addEventListener('click', (e) => { e.stopPropagation(); toggle(settingsModal, true); });
        if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => toggle(settingsModal, false));
        if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => toggle(settingsModal, false));

        // Share
        if (shareBtn) shareBtn.addEventListener('click', (e) => { 
            e.stopPropagation();
            userPopup.classList.add('hidden'); // Close others
            if (sharePopup.classList.contains('hidden')) toggle(sharePopup, true);
            else toggle(sharePopup, false);
        });
        if (closeShareBtn) closeShareBtn.addEventListener('click', () => toggle(sharePopup, false));
        if (sharePlusBtn) sharePlusBtn.addEventListener('click', () => {
            window.showCustomAlert("Coming Soon", "This feature is coming soon!", "info");
        });

        
        // Copy Link Logic
        const copyBtn = document.getElementById('share-copy-btn');
        const shareInput = document.querySelector('#share-popup input');
        // Pre-fill share input with current URL
        if (shareInput) shareInput.value = window.location.href;
        
        if (copyBtn && shareInput) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(shareInput.value).then(() => {
                    window.showCustomAlert("Link Copied", "Share link copied to clipboard", "success");
                    sharePopup.classList.add('hidden');
                });
            };
        }

        // User
        if (userIcon) userIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            sharePopup.classList.add('hidden'); // Close others
            if (userPopup.classList.contains('hidden')) toggle(userPopup, true);
            else toggle(userPopup, false);
        });
        
        // User Popup buttons logic
        const userButtons = userPopup.querySelectorAll('button');
        userButtons.forEach(btn => {
            btn.onclick = () => {
                 const text = btn.innerText.trim();
                 if (text.includes('Log Out')) {
                     window.showCustomAlert("Logged Out", "You have been logged out safely.", "success");
                 } else {
                     window.showCustomAlert(text, "This feature is coming soon.", "info");
                 }
                 userPopup.classList.add('hidden');
            };
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!sharePopup.contains(e.target) && e.target !== shareBtn && !shareBtn.contains(e.target)) {
                sharePopup.classList.add('hidden');
            }
            if (!userPopup.contains(e.target) && e.target !== userIcon) {
                userPopup.classList.add('hidden');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                toggle(settingsModal, false);
                sharePopup.classList.add('hidden');
                userPopup.classList.add('hidden');
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

        // Auto Save Logic
        const autoSaveToggle = document.getElementById('auto-save-toggle');
        const savedAutoSave = localStorage.getItem('autoSave') === 'true';
        
        if (autoSaveToggle) {
            autoSaveToggle.checked = savedAutoSave;
            if (savedAutoSave) startAutoSave();
            
            autoSaveToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                localStorage.setItem('autoSave', enabled);
                if (enabled) {
                    startAutoSave();
                    window.showCustomAlert("Auto Save On", "Board will save every 10s", "success");
                } else {
                    stopAutoSave();
                    window.showCustomAlert("Auto Save Off", "Auto save disabled", "info");
                }
            });
        }

        function startAutoSave() {
            stopAutoSave();
            autoSaveInterval = setInterval(() => {
                saveBoardState();
                if (saveStatusText) {
                    saveStatusText.innerText = 'Auto-Saved';
                    lastSaveTime = Date.now();
                }
            }, 10000);
        }

        function stopAutoSave() {
            if (autoSaveInterval) clearInterval(autoSaveInterval);
        }
    }


    /***********************
     * UNDO / REDO SYSTEM
     ***********************/
    function pushHistory(action) {
        // Don't push history if this is a remote update, as undo stack is local user action
        if (isRemoteUpdate) return;

        // Remove any history ahead of current step (if we redid then did new action)
        if (historyStep < history.length - 1) {
            history = history.slice(0, historyStep + 1);
        }
        // Add timestamp for history tracking
        action.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        history.push(action);
        if (history.length > MAX_HISTORY) {
            history.shift();
        } else {
            historyStep++;
        }
        updateUndoRedoUI();
        renderHistoryTracker();
    }

    function updateUndoRedoUI() {
        if (!undoBtn || !redoBtn) return;
        undoBtn.disabled = historyStep < 0;
        redoBtn.disabled = historyStep >= history.length - 1;
        undoBtn.classList.toggle('opacity-80', historyStep < 0);
        redoBtn.classList.toggle('opacity-80', historyStep >= history.length - 1);
    }

    function getHistoryLabel(action) {
        switch(action.type) {
            case 'DRAW': return 'Drew on Frame';
            case 'ADD_ELEMENT': return `Added ${action.elementType === 'flowNode' ? 'Node' : action.elementType === 'sprintList' ? 'Task List' : action.elementType}`;
            case 'MOVE_ELEMENT': return `Moved ${action.elementType}`;
            case 'ADD_EDGE': return 'Connected Nodes';
            case 'TASK_UPDATE': return `Checked Item in List`;
            case 'TASK_ADD': return `Added Item to List`;
            case 'TASK_EDIT': return `Edited Item in List`;
            default: return 'Action';
        }
    }

    function renderHistoryTracker() {
        if (!historyTracker) return;
        
        historyTracker.innerHTML = '';
        
        // Render history items
        // We'll include a "Start" state at index -1
        
        const createDot = (index, action) => {
             const dot = document.createElement('div');
             const isActive = index === historyStep;
             const isFuture = index > historyStep;
             const isStart = index === -1;

             dot.className = 'history-dot';
             
             // Colors
             if (isActive) {
                dot.classList.add('bg-blue-500', 'shadow-[0_0_0_2px_rgba(96,165,250,0.2)]');             } else if (isFuture) {
                 dot.classList.add('bg-gray-700'); // Dimmed
             } else {
                 dot.classList.add('bg-gray-400'); // Past
             }

             dot.onclick = () => jumpToHistory(index);
             
             // Tooltip events
             dot.onmouseenter = (e) => showHistoryTooltip(e, isStart ? "Initial State" : getHistoryLabel(action), isStart ? "" : action.timestamp);
             dot.onmouseleave = hideHistoryTooltip;
             
             historyTracker.appendChild(dot);
        };

        // Start Dot
        createDot(-1, null);

        // History Dots
        history.forEach((action, index) => {
            createDot(index, action);
        });
        
        // Auto-scroll to active dot
        const activeDot = historyTracker.children[historyStep + 1];
        if (activeDot) {
            // Use requestAnimationFrame to wait for layout
            requestAnimationFrame(() => {
                 activeDot.scrollIntoView({ block: "center", behavior: "smooth" });
            });
        }
    }

    function showHistoryTooltip(e, label, time) {
        if (!historyTooltip) return;
        const dot = e.target;
        const rect = dot.getBoundingClientRect();
        
        const tooltipLabel = document.getElementById('tooltip-label');
        const tooltipTime = document.getElementById('tooltip-time');
        
        if(tooltipLabel) tooltipLabel.innerText = label;
        if(tooltipTime) tooltipTime.innerText = time;
        
        historyTooltip.style.display = 'flex';
        
        // Position to the LEFT of the dot (dot is on right edge)
        // Tooltip width might vary, so we align right edge of tooltip to left edge of dot with some gap
        const gap = 24; // Increased from 12px to 24px
        const tooltipRect = historyTooltip.getBoundingClientRect();
        
        const top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        const left = rect.left - tooltipRect.width - gap;
        
        historyTooltip.style.top = `${top}px`;
        historyTooltip.style.left = `${left}px`;
        historyTooltip.style.opacity = '1';
    }

    function hideHistoryTooltip() {
        if (!historyTooltip) return;
        historyTooltip.style.display = 'none';
        historyTooltip.style.opacity = '0';
    }

    function jumpToHistory(targetIndex) {
        if (targetIndex === historyStep) return;
        
        // Undo until we reach target
        while (historyStep > targetIndex) {
            const action = history[historyStep];
            undoAction(action);
            historyStep--;
        }
        
        // Redo until we reach target
        while (historyStep < targetIndex) {
            historyStep++;
            const action = history[historyStep];
            redoAction(action);
        }
        
        updateUndoRedoUI();
        renderHistoryTracker();
    }

    if (undoBtn) {
        undoBtn.onclick = () => {
            if (historyStep >= 0) {
                const action = history[historyStep];
                undoAction(action);
                historyStep--;
                updateUndoRedoUI();
                renderHistoryTracker();
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
                renderHistoryTracker();
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
                if (action.elementType === 'sprintList') {
                    sprintLists = sprintLists.filter(l => l.id !== action.id);
                    updateSprintListTitles();
                }
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
            // Simplified Undo for sprint tasks - just rebuild list for now
            case 'TASK_UPDATE':
            case 'TASK_ADD':
            case 'TASK_EDIT':
                // Ideally we snapshot the list data, but for brevity we reload if we can
                // For robust undo, we need full state snap or inverse ops
                // This part is complex without deep state management, omit for basic request
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
                if (action.elementType === 'sprintList') {
                    sprintLists.push(action.data);
                    updateSprintListTitles();
                }
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
    customColorInput.addEventListener('input', e => {
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
    let autoSaveInterval;
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

        // Update drawing state from all canvases
        frames.forEach(f => {
            const canvas = f.element.querySelector('canvas');
            if(canvas) {
                drawingsData[f.id] = {
                    data: canvas.toDataURL(),
                    originalWidth: canvas.width,
                    originalHeight: canvas.height
                };
            }
        });
        localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(drawingsData));

        const state = {
            timestamp: Date.now(),
            frames: frames.map(f => ({
                id: f.id,
                x: f.element.style.left,
                y: f.element.style.top,
                w: f.element.style.width,
                h: f.element.style.height,
                title: f.element.querySelector('.frame-title-input').value,
                folderId: f.folderId
            })),
            notes: notes.map(n => ({
                id: n.dataset.id,
                x: n.style.left,
                y: n.style.top,
                w: n.style.width,
                h: n.style.height,
                content: n.querySelector('textarea').value,
                sprint: n.dataset.sprint || null,
                color: n.dataset.color || 'yellow', // Save Color
                parentId: n.parentElement.classList.contains('canvas-frame') ? n.parentElement.dataset.id : 'workspace',
                folderId: n.dataset.folderId
            })),
            sprintLists: currentSprintLists, // Use updated lists
            flowNodes: flowNodes.map(n => ({
                id: n.dataset.id,
                type: n.dataset.type,
                x: n.style.left,
                y: n.style.top,
                text: n.querySelector('span').innerText,
                folderId: n.dataset.folderId
            })),
            edges: edges.map(e => ({
                id: e.id,
                sourceNodeId: e.sourceNodeId,
                sourceHandle: e.sourceHandle,
                targetNodeId: e.targetNodeId,
                targetHandle: e.targetHandle
            })),
            folders: folders
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
        folders = [];
        while (edgesSvg.childNodes.length > 2) { 
            edgesSvg.removeChild(edgesSvg.lastChild);
        }

        // Restore Folders
        if(state.folders) folders = state.folders;

        // Restore Frames
        state.frames.forEach(f => {
            const fr = createFrame(
                parseFloat(f.x), parseFloat(f.y), 
                parseFloat(f.w), parseFloat(f.h), 
                f.title, f.id
            );
            fr.folderId = f.folderId;
        });

        // Restore Flow Nodes
        state.flowNodes.forEach(n => {
            createFlowNode(n.type, n.id, parseFloat(n.x), parseFloat(n.y), n.text);
            const node = flowNodes.find(x => x.dataset.id == n.id);
            if(node && n.folderId) node.dataset.folderId = n.folderId;
        });

        // Restore Notes
        state.notes.forEach(n => {
            let parent = workspace;
            if (n.parentId && n.parentId !== 'workspace') {
                const parentFrame = frames.find(f => f.id == n.parentId);
                if (parentFrame) parent = parentFrame.element;
            }
            addStickyNote(parent, n.id, n.content, parseFloat(n.x), parseFloat(n.y), n.sprint, n.color);
            const note = notes.find(x => x.dataset.id == n.id);
            if(note && n.folderId) note.dataset.folderId = n.folderId;
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

    // Helper to trigger save visual feedback
    function performSaveUI() {
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
    }

    if (saveBtn && saveStatusText) {
        saveBtn.onclick = () => {
            // Trigger local save and UI
            performSaveUI();
            
            // Emit save event to other clients
            emitUpdate('SAVE_TRIGGER', {});
        };
    }

    /***********************
     * REMOTE CURSORS
     ***********************/

    function updateRemoteCursor(data) {
        const { userId, x, y, persona } = data;
        let cursor = remoteCursors[userId];

        if (!cursor) {
            // Create cursor element
            const el = document.createElement('div');
            // Removed 'transition-transform' and 'duration-75' classes to handle manual transition for left/top
            el.className = 'remote-cursor absolute pointer-events-none flex items-start z-[999]';
            
            // OPTIMIZED: Tighter transition (15ms) to reduce visual lag behind drawing
            el.style.transition = 'left 0.015s linear, top 0.015s linear';
            el.style.left = '0px';
            el.style.top = '0px';
            
            // Icon
            const icon = document.createElement('i');
            icon.className = `${persona.icon || 'fa-solid fa-location-arrow'} text-lg`;
            icon.style.color = persona.iconColor || persona.color;
            
            // Handle rotation - applied to the ICON, not the container
            if (typeof persona.rotation === 'number') {
                icon.style.transform = `rotate(${persona.rotation}deg)`;
            } else if(persona.rotate) {
                 icon.style.transform = 'rotate(180deg)';
            }
            
            // Label
            const label = document.createElement('div');
            label.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm whitespace-nowrap ml-1 mt-3';
            label.style.backgroundColor = persona.bg;
            label.style.color = persona.color;
            label.innerText = persona.name || 'Guest';

            el.appendChild(icon);
            el.appendChild(label);
            workspace.appendChild(el);

            cursor = { element: el, timeout: null };
            remoteCursors[userId] = cursor;
        }

        // Update position using left/top instead of transform to avoid stacking issues with workspace scale
        cursor.element.style.left = `${x}px`;
        cursor.element.style.top = `${y}px`;

        // Clear remove timer
        if (cursor.timeout) clearTimeout(cursor.timeout);

        // Remove cursor after 10 seconds of inactivity
        cursor.timeout = setTimeout(() => {
            if (cursor.element && cursor.element.parentNode) {
                cursor.element.parentNode.removeChild(cursor.element);
            }
            delete remoteCursors[userId];
        }, 10000);
    }

    // Track local mouse movement
    document.addEventListener('mousemove', (e) => {
        // Calculate workspace coordinates for the cursor
        const wsRect = workspace.getBoundingClientRect();
        const x = (e.clientX - wsRect.left) / currentScale;
        const y = (e.clientY - wsRect.top) / currentScale;
        
        throttledCursorEmit(x, y);
    });

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
                // Just draw the image without resetting the canvas size (which clears context)
                ctx.drawImage(img, 0, 0);
            };
            img.src = data.data;
        }
    }

    /*******************************************************
     * FLOW CHART SYSTEM
     *******************************************************/
    
    function getCenterPos() {
        const containerW = scrollContainer.clientWidth;
        const containerH = scrollContainer.clientHeight;
        const screenCenterX = scrollContainer.scrollLeft + containerW / 2;
        const screenCenterY = scrollContainer.scrollTop + containerH / 2;
        return {
            x: screenCenterX / currentScale,
            y: screenCenterY / currentScale
        };
    }

    function createFlowNode(type, id = null, x = null, y = null, textContent = null) {
        if (x === null || y === null) {
            const center = getCenterPos();
            x = center.x + (Math.random() * 40 - 20);
            y = center.y + (Math.random() * 40 - 20);
        }
        
        const nodeId = id || Date.now();
        const displayText = textContent || (type === 'circle' ? 'Start' : (type === 'rect' ? 'Analysis' : 'Prototype'));

        const styles = {
            circle: { dot: 'bg-emerald-400', shadow: 'shadow-[0_0_0_2px_rgba(52,211,153,0.2)]' },
            rect: { dot: 'bg-blue-400', shadow: 'shadow-[0_0_0_2px_rgba(96,165,250,0.2)]' },
            diamond: { dot: 'bg-purple-400', shadow: 'shadow-[0_0_0_2px_rgba(192,132,252,0.2)]' }
        };
        const style = styles[type] || styles.circle;

        const node = document.createElement('div');
        node.dataset.id = nodeId;
        node.dataset.type = type;
        node.className = 'absolute w-32 h-14 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center gap-2 z-10 select-none group hover:shadow-md transition-shadow';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        node.innerHTML = `
            <div class="w-2 h-2 rounded-full ${style.dot} ${style.shadow} pointer-events-none"></div>
            <span class="text-sm font-semibold text-gray-700 pointer-events-none">${displayText}</span>
        `;

        const handles = ['top', 'right', 'bottom', 'left'];
        handles.forEach(pos => {
            const h = document.createElement('div');
            h.className = `flow-handle handle-${pos} opacity-0 group-hover:opacity-100`;
            h.dataset.handle = pos;
            h.dataset.nodeId = nodeId;
            node.appendChild(h);
            setupHandleEvents(h, node);
        });

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
                emitUpdate('NODE_EDIT', { id: nodeId, text: newText });
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
            
            // Emit new node creation
            emitUpdate('ADD', { 
                elementType: 'flowNode', 
                data: { id: nodeId, type, x, y, text: displayText } 
            });
        }

        setupDraggable(node, 'flowNode');
        updateTracker();
    }

    /***********************
     * SPRINT TASK LIST
     ***********************/
    function updateSprintListTitles() {
        // Enforce sequential numbering 1..N for all lists currently on board
        sprintLists.forEach((listData, index) => {
            listData.title = `Sprint Task ${index + 1}`;
            const el = document.querySelector(`.sprint-list[data-id="${listData.id}"]`);
            if (el) {
                const titleEl = el.querySelector('h4');
                if(titleEl) {
                    titleEl.innerHTML = `<div class="w-2 h-2 rounded-sm bg-indigo-500"></div> ${listData.title}`;
                }
            }
        });
        updateTracker();
    }

    function addSprintList(x = null, y = null, id = null, existingData = null) {
        if (x === null || y === null) {
            const center = getCenterPos();
            x = center.x - 128; 
            y = center.y - 100; 
        }
        
        const listId = id || Date.now();
        
        let data;
        if (existingData) {
            data = existingData;
        } else {
            // Initial empty tasks with placeholders
            data = {
                id: listId,
                title: `Sprint Task ${sprintLists.length + 1}`,
                items: [
                    { text: '', placeholder: 'Task 1', completed: false },
                    { text: '', placeholder: 'Task 2', completed: false },
                    { text: '', placeholder: 'Task 3', completed: false }
                ]
            };
        }

        const container = document.createElement('div');
        container.className = 'absolute w-64 bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow select-none sprint-list z-10';
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.dataset.id = listId;

        const renderContent = () => {
            const count = data.items.length;
            
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
                const isChecked = item.completed ? 'bg-indigo-500' : 'bg-white border-[1.5px] border-gray-300';
                const checkIcon = item.completed ? '<i class="fa-solid fa-check text-white text-[10px]" style="stroke-width: 3px;"></i>' : '';
                const placeholder = item.placeholder || `Task ${idx + 1}`;
                
                html += `
                <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer task-item" data-idx="${idx}">
                    <div class="w-5 h-5 ${isChecked} rounded-[6px] flex items-center justify-center shrink-0 transition-transform check-trigger">
                        ${checkIcon}
                    </div> 
                    <input type="text" 
                           class="text-sm bg-transparent outline-none w-full ${item.completed ? 'text-gray-400 line-through decoration-gray-200' : 'text-gray-700'} font-medium placeholder-input"
                           value="${item.text}"
                           placeholder="${placeholder}"
                           data-input-idx="${idx}">
                </div>`;
            });
            
            html += `
                 <div class="p-2 mt-1 border-t border-gray-50">
                    <input type="text" placeholder="+ Add item" class="w-full text-xs bg-transparent outline-none text-gray-500 hover:bg-gray-50 p-1 rounded px-2 new-item-input">
                 </div>
            </div>`;
            
            container.innerHTML = html;

            // Checkbox Toggle Logic
            container.querySelectorAll('.check-trigger').forEach(el => {
                el.addEventListener('mousedown', (e) => e.stopPropagation()); 
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const parent = el.closest('.task-item');
                    const idx = parseInt(parent.dataset.idx);
                    data.items[idx].completed = !data.items[idx].completed;
                    
                    pushHistory({ type: 'TASK_UPDATE', listId: listId, taskIdx: idx, completed: data.items[idx].completed });
                    emitUpdate('TASK_UPDATE', { listId: listId, taskIdx: idx, completed: data.items[idx].completed });
                    
                    renderContent();
                });
            });

            // Input Logic (Edit items)
            container.querySelectorAll('input[data-input-idx]').forEach(input => {
                input.addEventListener('mousedown', (e) => e.stopPropagation());
                input.addEventListener('change', (e) => {
                    const idx = parseInt(input.dataset.inputIdx);
                    data.items[idx].text = input.value;
                    
                    pushHistory({ type: 'TASK_EDIT', listId: listId, taskIdx: idx, text: input.value });
                    emitUpdate('TASK_EDIT', { listId: listId, taskIdx: idx, text: input.value });
                });
            });

            const newItemInput = container.querySelector('.new-item-input');
            newItemInput.addEventListener('mousedown', (e) => e.stopPropagation());
            newItemInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && newItemInput.value.trim()) {
                    const newItem = { text: newItemInput.value.trim(), placeholder: `Task ${data.items.length + 1}`, completed: false };
                    data.items.push(newItem);
                    
                    pushHistory({ type: 'TASK_ADD', listId: listId, newItem: newItem });
                    emitUpdate('TASK_ADD', { listId: listId, newItem: newItem });
                    
                    renderContent();
                }
            });
            
            const delBtn = container.querySelector('.delete-btn');
            delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            delBtn.addEventListener('click', () => {
                container.remove();
                sprintLists = sprintLists.filter(l => l.id !== listId);
                updateSprintListTitles(); // Re-index remaining lists
                emitUpdate('DELETE', { id: listId, elementType: 'sprintList' });
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
            // Update title to ensure sequential naming on creation
            updateSprintListTitles();
            
            // Emit new list creation
            emitUpdate('ADD', { elementType: 'sprintList', data: data });
        } else {
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
            const startX = (rect.left + rect.width/2 - wsRect.left) / currentScale;
            const startY = (rect.top + rect.height/2 - wsRect.top) / currentScale;

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
        const mouseX = (e.clientX - wsRect.left) / currentScale;
        const mouseY = (e.clientY - wsRect.top) / currentScale;

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
                emitUpdate('DELETE', { id: edgeId, elementType: 'edge' });
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
            
            emitUpdate('ADD_EDGE', { 
                edge: { id: edgeId, sourceNodeId: sourceId, sourceHandle, targetNodeId: targetId, targetHandle } 
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

            const startX = (sRect.left + sRect.width/2 - wsRect.left) / currentScale;
            const startY = (sRect.top + sRect.height/2 - wsRect.top) / currentScale;
            const endX = (tRect.left + tRect.width/2 - wsRect.left) / currentScale;
            const endY = (tRect.top + tRect.height/2 - wsRect.top) / currentScale;

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

                    // Real-time Move Sync (Throttled)
                    const absX = startX + x;
                    const absY = startY + y;
                    throttledMoveEmit(element.dataset.id, absX, absY);
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
                    // Update edges one last time to snap to final position
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
                        
                        emitUpdate('MOVE', { id: element.dataset.id, x: finalX, y: finalY });
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
        let lastX = 0;
        let lastY = 0;

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
            lastX = x;
            lastY = y;
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

            // Emit Real-time Draw Point
            emitUpdate('DRAW_POINT', {
                frameId: frameId,
                x: x,
                y: y,
                prevX: lastX,
                prevY: lastY,
                color: penColor,
                size: activeTool === 'eraser' ? eraserSize : penSize,
                tool: activeTool
            });

            lastX = x;
            lastY = y;
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
                
                // Still emit full image for consistency/finality
                emitUpdate('DRAW', { frameId: frameId, image: canvas.toDataURL() });
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
            
            // Local Canvas Resize Logic (Prevent Distortion/Blur)
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = oldWidth;
            tempCanvas.height = oldHeight;
            tempCtx.drawImage(canvas, 0, 0);

            canvas.width = newW;
            canvas.height = newH;
            
            // Calculate offset to keep drawing stationary relative to world
            // delta.left/top are screen pixels, divide by scale to get canvas pixels
            const dx = -(delta.left / currentScale);
            const dy = -(delta.top / currentScale);

            // Draw original image at offset without stretching
            ctx.drawImage(tempCanvas, dx, dy); 
            
            saveDrawingToLocalStorage(frameId, canvas);

            // Emit Real-time Resize
            throttledResizeEmit(frameId, newW, newH, null);

        }).on('resizeend', event => {
             // Emit final resize with image to ensure exact sync
             emitUpdate('RESIZE', { 
                 id: frameId, 
                 elementType: 'frame', 
                 w: parseFloat(frame.style.width), 
                 h: parseFloat(frame.style.height),
                 image: canvas.toDataURL() 
             });
        });

        const frameData = { id: frameId, x, y, width, height, title, element: frame, folderId: null };
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
        
        emitUpdate('ADD', { elementType: 'frame', data: { id: newFrame.id, x, y, w: width, h: height, title: `Board ${frames.length}` } });
    }

    /***********************
     * STICKY NOTES
     ***********************/
        function addStickyNote(parent = workspace, id = null, content = '', loadX=null, loadY=null, sprint=null, color=null) {
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

        const note = document.createElement('div');
        note.className = 'absolute w-64 bg-[#FFFCF0] border border-yellow-200/60 rounded-2xl p-5 flex flex-col gap-3 group shadow-sm hover:shadow-none transition-shadow select-none sticky-note';
        note.style.left = `${x}px`;
        note.style.top = `${y}px`;
        note.dataset.id = noteId;
        if (sprint) note.dataset.sprint = sprint;
        if (color) note.dataset.color = color;

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
        menuBtn.className = 'fa-solid fa-ellipsis text-yellow-300 text-sm cursor-pointer hover:text-yellow-500 transition-colors z-30';
        menuContainer.appendChild(menuBtn);

        // Dropdown Menu
        const dropdown = document.createElement('div');
        // Replaced Tailwind styling with custom 'sticky-dropdown' class for easier theming
        dropdown.className = 'sticky-dropdown absolute top-full right-0 mt-2 w-56 rounded-2xl shadow-xl z-[60] hidden flex-col py-1 animate-fade-in-out origin-top-right';
        dropdown.style.animation = 'none'; // reset animation for clean toggle
        
        const createDropdownItem = (text, onClick, iconClass = null, hasSubmenu = false) => {
            const item = document.createElement('div');
            item.className = `sticky-dropdown-item px-3 py-2 text-xs cursor-pointer rounded-lg mx-1.5 my-0.5 flex w-md items-center gap-2 transition-colors relative ${hasSubmenu ? 'has-submenu' : ''}`;
            
            if(iconClass) {
                item.innerHTML = `<i class="${iconClass} w-4"></i> ${text}`;
            } else {
                item.innerText = text;
            }
            
            if (onClick) {
                item.onclick = (e) => {
                    e.stopPropagation();
                    onClick();
                    dropdown.classList.add('hidden');
                };
            }
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
            emitUpdate('NOTE_UPDATE', { id: noteId, sprint: newSprint }); // Sync Sprint
            updateTracker();
            dropdown.classList.add('hidden'); // Close after selection
        };

        // Assign to Sprint Item with Submenu
        const assignBtn = createDropdownItem('Assign to Sprint', null, 'fa-solid fa-list-check', true);
        // Add chevron right indicator
        assignBtn.innerHTML += '<i class="fa-solid fa-chevron-right ml-auto text-[10px] opacity-50"></i>';
        
        // Create Submenu Container
        const submenu = document.createElement('div');
        submenu.className = 'sticky-submenu hidden absolute right-full top-0 mr-2 flex-col gap-1 shadow-xl rounded-xl p-1 w-48';
        assignBtn.onmouseenter = () => submenu.classList.remove('hidden');
        assignBtn.onmouseleave = () => submenu.classList.add('hidden');
        
        // Dynamic Sprints based on lists
        const sprintCount = sprintLists.length > 0 ? sprintLists.length : 3; // Default to 3 if none
        
        for(let i=1; i<=sprintCount; i++) {
            const sprintItem = document.createElement('div');
            sprintItem.className = 'sticky-dropdown-item px-3 py-1.5 text-xs cursor-pointer rounded-lg mx-1.5 my-1 flex items-center gap-2 transition-colors';
            sprintItem.innerText = `Sprint ${i}`;
            sprintItem.onclick = (e) => {
                e.stopPropagation();
                updateSprintTag(`Sprint ${i}`);
            };
            submenu.appendChild(sprintItem);
        }
        
        // Clear Sprint Option
        const clearItem = document.createElement('div');
        clearItem.className = 'sticky-dropdown-item px-3 py-1.5 text-xs cursor-pointer rounded-lg mx-1.5 my-0.5 flex items-center gap-2 transition-colors text-gray-400 hover:text-red-400';
        clearItem.innerText = 'Clear Sprint';
        clearItem.onclick = (e) => {
            e.stopPropagation();
            updateSprintTag(null);
        };
        submenu.appendChild(clearItem);

        assignBtn.appendChild(submenu);
        dropdown.appendChild(assignBtn);

        const divider1 = document.createElement('div');
        divider1.className = 'sticky-dropdown-divider border-t my-1 mx-2';
        dropdown.appendChild(divider1);

        // Duplicate
        dropdown.appendChild(createDropdownItem('Duplicate', () => {
             const rect = note.getBoundingClientRect();
             const wsRect = workspace.getBoundingClientRect();
             const dx = (rect.left - wsRect.left) / currentScale + 20;
             const dy = (rect.top - wsRect.top) / currentScale + 20;
             addStickyNote(parent, null, content, dx, dy, sprint, note.dataset.color);
        }, 'fa-regular fa-copy'));

        const divider2 = document.createElement('div');
        divider2.className = 'sticky-dropdown-divider border-t my-1 mx-2';
        dropdown.appendChild(divider2);

        // Delete
        const deleteItem = createDropdownItem('Delete', () => {
            note.remove();
            notes = notes.filter(n => n.dataset.id != noteId);
            updateTracker();
            emitUpdate('DELETE', { id: noteId, elementType: 'note' });
        }, 'fa-solid fa-trash');
        deleteItem.classList.add('text-red-400', 'hover:text-red-300');
        dropdown.appendChild(deleteItem);

        menuContainer.appendChild(dropdown);
        header.appendChild(menuContainer);

        // Toggle Dropdown
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.sticky-dropdown').forEach(d => {
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
        textarea.className = 'note-textarea w-full h-full min-h-[80px] bg-transparent resize-none outline-none text-xl font-medium placeholder-gray-200 text-gray-800 leading-[1.2] py-1 placeholder-yellow-700/20 pointer-events-none';
        textarea.value = content;
        textarea.placeholder = "Write your idea...";
        
        note.addEventListener('dblclick', (e) => {
            if (e.target.closest('.fa-ellipsis') || e.target.closest('.sticky-dropdown-item')) return;
            
            textarea.classList.remove('pointer-events-none');
            textarea.focus();
            const val = textarea.value;
            textarea.value = '';
            textarea.value = val;
        });
        
        textarea.addEventListener('input', () => {
             emitUpdate('NOTE_EDIT', { id: noteId, content: textarea.value });
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
        // ADDED 'sprint-tag' CLASS HERE FOR SOCKET SYNC
        sprintTag.className = 'sprint-tag px-2 py-0.5 bg-yellow-100/50 rounded-md border border-yellow-200/30 text-[10px] font-semibold text-yellow-700';
        if (sprint) {
            sprintTag.innerText = `#${sprint}`;
        } else {
            sprintTag.classList.add('hidden');
        }
        footer.appendChild(sprintTag);

        const avatar = document.createElement('div');
        avatar.className = ' px-1.5 py-1 rounded-full bg-yellow-200 flex items-center justify-center text-[9px] font-bold text-yellow-700 shadow-sm';
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
            
            emitUpdate('ADD', { elementType: 'note', data: { id: noteId, x, y, content, sprint, color: note.dataset.color } });
        }
        updateTracker();
    }

    /***********************
     * CONTEXT MENU LOGIC
     ***********************/
    function initContextMenu() {
        const menu = document.getElementById('context-menu');
        let targetElementData = null;

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Determine target
            let target = e.target;
            targetElementData = null;

            // Find if clicked on an element we track
            const noteEl = target.closest('[data-id]'); // Frames, notes, nodes, lists have data-id on container
            
            // Determine Type
            if (noteEl) {
                const id = noteEl.dataset.id;
                if (noteEl.classList.contains('canvas-frame')) targetElementData = { type: 'frame', id, el: noteEl };
                else if (noteEl.classList.contains('sprint-list')) targetElementData = { type: 'sprintList', id, el: noteEl };
                else if (noteEl.dataset.type) targetElementData = { type: 'flowNode', id, el: noteEl }; // nodes
                else if (noteEl.classList.contains('sticky-note')) targetElementData = { type: 'note', id, el: noteEl };
            }

            // Build Menu Items
            menu.innerHTML = '';
            
            const addItem = (text, icon, onClick) => {
                const item = document.createElement('div');
                item.className = 'sticky-dropdown-item px-4 py-2 text-xs cursor-pointer mx-2 my-0.5 flex items-center gap-3 transition-colors dropdown-separator rounded-lg';
                item.innerHTML = `<i class="${icon} w-4"></i> ${text}`;
                item.onclick = (ev) => {
                    ev.stopPropagation();
                    onClick();
                    menu.classList.add('hidden');
                };
                menu.appendChild(item);
            };

            if (targetElementData) {
                // Element Actions
                addItem('Duplicate', 'fa-solid fa-copy', () => duplicateElement(targetElementData));
                addItem('Bring to Front', 'fa-solid fa-layer-group', () => {
                    workspace.appendChild(targetElementData.el);
                });
                addItem('Send to Back', 'fa-solid fa-layer-group', () => {
                    // Insert after SVG layer
                    workspace.insertBefore(targetElementData.el, edgesSvg.nextSibling);
                });
                
                const divider = document.createElement('div');
                divider.className = 'sticky-dropdown-divider border-t my-1 mx-2';
                menu.appendChild(divider);
                
                addItem('Delete', 'fa-solid fa-trash text-red-400', () => deleteElement(targetElementData));
            } else {
                // Workspace Actions
                addItem('New Sticky Note', 'fa-solid fa-sticky-note', () => {
                    const center = getMouseWorkspacePos(e);
                    addStickyNote(workspace, null, '', center.x, center.y);
                });
                 addItem('New Task List', 'fa-solid fa-list-check', () => {
                    const center = getMouseWorkspacePos(e);
                    addSprintList(center.x, center.y);
                });
                addItem('Reset View', 'fa-solid fa-compress', () => {
                    scrollContainer.scrollTo({ left: 14000/2 - scrollContainer.clientWidth/2, top: 14000/2 - scrollContainer.clientHeight/2, behavior: 'smooth' });
                    currentScale = 1;
                    workspace.style.transform = `scale(1)`;
                });
            }

            // Position Menu
            const x = e.clientX;
            const y = e.clientY;
            
            // Adjust bounds if offscreen
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
            
            menu.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
             if (!menu.contains(e.target)) menu.classList.add('hidden');
        });
    }

    function getMouseWorkspacePos(e) {
        const wsRect = workspace.getBoundingClientRect();
        return {
            x: (e.clientX - wsRect.left) / currentScale,
            y: (e.clientY - wsRect.top) / currentScale
        };
    }

    function deleteElement(data, isRemote = false) {
        data.el.remove();
        if (data.type === 'frame') frames = frames.filter(f => f.id != data.id);
        else if (data.type === 'note') notes = notes.filter(n => n.dataset.id != data.id);
        else if (data.type === 'sprintList') {
            sprintLists = sprintLists.filter(l => l.id != data.id);
            updateSprintListTitles();
        }
        else if (data.type === 'flowNode') {
            flowNodes = flowNodes.filter(n => n.dataset.id != data.id);
            updateEdges(); // Clean up edges
        }
        updateTracker();
        
        if (!isRemote) {
            emitUpdate('DELETE', { id: data.id, elementType: data.type });
        }
    }

    function duplicateElement(data) {
        const offset = 20;
        const x = parseFloat(data.el.style.left) + offset;
        const y = parseFloat(data.el.style.top) + offset;

        if (data.type === 'note') {
            const note = notes.find(n => n.dataset.id == data.id);
            const content = note.querySelector('textarea').value;
            const sprint = note.dataset.sprint;
            const color = note.dataset.color;
            addStickyNote(workspace, null, content, x, y, sprint, color);
        } else if (data.type === 'sprintList') {
            const list = sprintLists.find(l => l.id == data.id);
            // Deep copy items
            const newData = JSON.parse(JSON.stringify(list));
            newData.id = null; // Reset ID for generation
            newData.title = ''; // Let addSprintList generate title
            addSprintList(x, y, null, newData);
        } else if (data.type === 'flowNode') {
            const node = flowNodes.find(n => n.dataset.id == data.id);
            const text = node.querySelector('span').innerText || node.querySelector('input')?.value;
            createFlowNode(node.dataset.type, null, x, y, text);
        } else if (data.type === 'frame') {
             window.showCustomAlert("Duplicate Frame", "Duplicating entire frames including drawings is complex and coming soon!", "info");
        }
    }

    /***********************
     * INITIALIZATION
     ***********************/
    function centerDefaultFrame() {
        const width = 800, height = 500;
        const centerX = (14000 - width) / 2;
        const centerY = (14000 - height) / 2;
        
        // --- FIX: Use deterministic ID for default frame so all users share it ---
        // Was: const newFrame = createFrame(centerX, centerY, width, height, 'Board 1');
        const newFrame = createFrame(centerX, centerY, width, height, 'Board 1', 'default-board-1');
        
        const containerWidth = scrollContainer.clientWidth;
        const containerHeight = scrollContainer.clientHeight;
        scrollContainer.scrollLeft = 14000/2 - containerWidth / 2;
        scrollContainer.scrollTop = 14000/2 - containerHeight / 2;
    }

    document.addEventListener('click', (e) => {
        if (e.target === workspace || e.target === scrollContainer || e.target.id === 'edges-layer') {
             document.querySelectorAll('.canvas-frame').forEach(f => f.classList.remove('ring-blue-500'));
        }
    });

    function init() {
        isRemoteUpdate = true; // Suppress emits during load
        
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
            scrollContainer.scrollLeft = 14000/2 - containerWidth / 2;
            scrollContainer.scrollTop = 14000/2 - containerHeight / 2;
        }

        isRemoteUpdate = false; // Resume emits

        customCursor.style.display = 'block';
        const boardContainer = document.getElementById('board-container');
        if (boardContainer) boardContainer.classList.add('no-cursor');
        
        // Settings init
        initSettingsAndPopups();
        initContextMenu();

        updateUndoRedoUI();
        // Init tracker UI
        renderTrackerSidebar();
        updateTracker();
        renderHistoryTracker(); // Initial render
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