// --- Global State Management ---
const state = {
    frames: [],
    stickyNotes: [],
    activeTool: "mouse",
    penColor: "#1a1a1a",
    penSize: 2,
    eraserSize: 15,
    cursorPos: { x: 0, y: 0 },
    movingElementId: null, // Tracks the ID of the element being dragged/resized
    isChatOpen: false,
    openToolPopup: null,
    nextFrameId: 1,
    nextNoteId: 1,
};

// --- DOM Elements ---
const containerRef = document.getElementById('container-ref');
const whiteboard = document.getElementById('whiteboard');
const customCursor = document.getElementById('custom-cursor');
const sidebar = document.getElementById('sidebar');

// Tool buttons
const toolMouse = document.getElementById('tool-mouse');
const toolAddFrame = document.getElementById('tool-add-frame');
const toolAddNote = document.getElementById('tool-add-note');
const toolPen = document.getElementById('tool-pen');
const toolEraser = document.getElementById('tool-eraser');

// Tool popups
const penPopup = document.getElementById('pen-popup');
const eraserPopup = document.getElementById('eraser-popup');
const penColorsContainer = document.getElementById('pen-colors');
const penColorPicker = document.getElementById('pen-color-picker');
const penSizesContainer = document.getElementById('pen-sizes');
const eraserSizesContainer = document.getElementById('eraser-popup');

// --- Utility Functions ---

/**
 * Replaces the original react-rnd functionality with a simple dragging and resizing logic.
 * Note: This is a simplified replacement. Full Rnd behavior is very complex.
 */
class DraggableResizable {
    constructor(element, onDragStop, onResizeStop) {
        this.element = element;
        this.onDragStop = onDragStop;
        this.onResizeStop = onResizeStop;
        this.isDragging = false;
        this.isResizing = false;
        this.startX = 0;
        this.startY = 0;
        this.initialX = element.offsetLeft;
        this.initialY = element.offsetTop;

        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.element.addEventListener('touchstart', this.onMouseDown.bind(this)); // For touch devices
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('touchmove', this.onMouseMove.bind(this));
        document.addEventListener('touchend', this.onMouseUp.bind(this));

        this.addResizeHandles();
    }

    // Creates simplified resize handles (bottom-right only)
    addResizeHandles() {
        const handle = document.createElement('div');
        handle.className = 'absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize opacity-0 hover:opacity-100 transition';
        handle.dataset.resize = 'se';
        this.element.appendChild(handle);
    }

    getPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    onMouseDown(e) {
        const { x, y } = this.getPos(e);
        this.startX = x;
        this.startY = y;
        this.initialX = this.element.offsetLeft;
        this.initialY = this.element.offsetTop;

        if (e.target.dataset.resize) {
            this.isResizing = true;
            this.initialWidth = this.element.offsetWidth;
            this.initialHeight = this.element.offsetHeight;
            this.resizingDirection = e.target.dataset.resize;
            state.movingElementId = this.element.dataset.id;
        } else if (state.activeTool === "mouse" || this.element.classList.contains('frame-header')) { // Only drag if mouse tool is active
            this.isDragging = true;
            state.movingElementId = this.element.dataset.id;
        }

        if (this.isDragging || this.isResizing) {
            this.element.style.zIndex = 10; // Bring to front
            e.preventDefault(); // Prevent default browser drag
        }
    }

    onMouseMove(e) {
        if (!this.isDragging && !this.isResizing) return;
        
        const { x, y } = this.getPos(e);
        const dx = x - this.startX;
        const dy = y - this.startY;

        if (this.isDragging) {
            this.element.style.left = `${this.initialX + dx}px`;
            this.element.style.top = `${this.initialY + dy}px`;
        } else if (this.isResizing) {
            // Simplified resize
            const newWidth = this.initialWidth + dx;
            const newHeight = this.initialHeight + dy;
            this.element.style.width = `${Math.max(100, newWidth)}px`; // Min size
            this.element.style.height = `${Math.max(100, newHeight)}px`;
        }
    }

    onMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.element.style.zIndex = 1;
            const newX = this.element.offsetLeft;
            const newY = this.element.offsetTop;
            this.onDragStop(newX, newY);
        } else if (this.isResizing) {
            this.isResizing = false;
            this.element.style.zIndex = 1;
            const newWidth = this.element.offsetWidth;
            const newHeight = this.element.offsetHeight;
            this.onResizeStop(newWidth, newHeight, this.element.offsetLeft, this.element.offsetTop);
        }
        
        state.movingElementId = null;
    }
}


/**
 * Manages the drawing on a canvas element.
 */
class CanvasDrawer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.ctx = canvas.getContext("2d");
        this.drawing = false;

        this.initializeCanvas();
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));
    }

    initializeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.ctx.lineCap = "round";
        this.ctx.strokeStyle = state.penColor;
        this.ctx.lineWidth = state.penSize;
    }

    updateDimensions(width, height) {
        this.width = width;
        this.height = height;
        this.initializeCanvas();
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { 
            x: e.clientX - rect.left, 
            y: e.clientY - rect.top 
        };
    }

    startDrawing(e) {
        if (!["pen", "eraser"].includes(state.activeTool)) return;
        if (state.movingElementId) return; // Don't draw if an Rnd element is being moved/resized

        const { x, y } = this.getMousePos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.drawing = true;
    }

    draw(e) {
        if (!this.drawing) return;
        const { x, y } = this.getMousePos(e);

        if (state.activeTool === "eraser") {
            this.ctx.globalCompositeOperation = "destination-out";
            this.ctx.lineWidth = state.eraserSize;
        } else {
            this.ctx.globalCompositeOperation = "source-over";
            this.ctx.strokeStyle = state.penColor;
            this.ctx.lineWidth = state.penSize;
        }

        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }

    stopDrawing() {
        if (!this.drawing) return;
        this.ctx.closePath();
        this.drawing = false;
    }
}

// Map to store CanvasDrawer instances
const canvasDrawers = {};


/**
 * Checks if a sticky note is inside a frame (based on center point).
 */
const isInsideFrame = (note, frame) => {
    const noteCenterX = note.x + note.width / 2;
    const noteCenterY = note.y + note.height / 2;
    
    return noteCenterX > frame.x &&
           noteCenterX < frame.x + frame.width &&
           noteCenterY > frame.y &&
           noteCenterY < frame.y + frame.height;
};


/**
 * Updates the sticky notes state after a drag/resize.
 */
const updateStickyNotePosition = (noteId, newX, newY, newWidth, newHeight) => {
    const noteIndex = state.stickyNotes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) return;

    let movedNote = state.stickyNotes[noteIndex];
    let newNote = { ...movedNote, x: newX, y: newY };
    if (newWidth) newNote.width = newWidth;
    if (newHeight) newNote.height = newHeight;

    const currentAbsoluteX = newNote.parentFrame ? state.frames.find(f => f.id === newNote.parentFrame).x + newNote.x : newNote.x;
    const currentAbsoluteY = newNote.parentFrame ? state.frames.find(f => f.id === newNote.parentFrame).y + newNote.y : newNote.y;

    // Temporarily set absolute position for frame check
    const absoluteNote = { ...newNote, x: currentAbsoluteX, y: currentAbsoluteY };

    const insideFrame = state.frames.find(frame => isInsideFrame(absoluteNote, frame));

    if (insideFrame && newNote.parentFrame !== insideFrame.id) {
        // Moving from outside/another frame INTO a frame
        newNote.parentFrame = insideFrame.id;
        newNote.x = absoluteNote.x - insideFrame.x; // Relative position
        newNote.y = absoluteNote.y - insideFrame.y;
    } else if (!insideFrame && newNote.parentFrame !== null) {
        // Moving from inside a frame to OUTSIDE
        const oldFrame = state.frames.find(f => f.id === newNote.parentFrame);
        if (oldFrame) {
            newNote.x = oldFrame.x + newNote.x; // Convert back to absolute position
            newNote.y = oldFrame.y + newNote.y;
        }
        newNote.parentFrame = null;
    } else if (!newNote.parentFrame) {
        // Moving outside frame to outside frame
        newNote.x = newX;
        newNote.y = newY;
    } else {
        // Moving inside frame (relative coordinates)
        newNote.x = newX;
        newNote.y = newY;
    }

    state.stickyNotes = state.stickyNotes.map((n, i) => (i === noteIndex ? newNote : n));
    renderWhiteboard();
};


/**
 * Updates the frame state after a drag/resize.
 */
const updateFramePosition = (frameId, newX, newY, newWidth, newHeight) => {
    const frameIndex = state.frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const oldFrame = state.frames[frameIndex];
    let newFrame = { ...oldFrame };
    
    if (newX !== undefined) newFrame.x = newX;
    if (newY !== undefined) newFrame.y = newY;
    if (newWidth !== undefined) newFrame.width = newWidth;
    if (newHeight !== undefined) {
        newFrame.height = newHeight;
        // Also update the canvas drawer if dimensions changed
        if (canvasDrawers[frameId]) {
            canvasDrawers[frameId].updateDimensions(newFrame.width, newFrame.height);
        }
    }

    state.frames = state.frames.map((f, i) => (i === frameIndex ? newFrame : f));
    renderWhiteboard();
};

/**
 * Creates the HTML for a sticky note.
 */
const createStickyNoteElement = (note) => {
    const noteEl = document.createElement('div');
    noteEl.className = 'draggable-resizable-box absolute flex no-cursor rounded-xl p-2 bg-yellow-100/80 backdrop-blur-md border border-yellow-200';
    noteEl.dataset.id = note.id;
    noteEl.style.width = `${note.width}px`;
    noteEl.style.height = `${note.height}px`;

    // Position: absolute vs relative depends on parentFrame
    if (note.parentFrame) {
        noteEl.style.position = 'absolute';
    } else {
        noteEl.style.position = 'absolute';
        noteEl.style.left = `${note.x}px`;
        noteEl.style.top = `${note.y}px`;
    }
    
    // Inner content
    const innerContent = `
        <div class="flex items-center justify-center w-full h-full">
            <textarea
                class="sticky-note-textarea"
                data-note-id="${note.id}"
            >${note.text}</textarea>
            <button class="fixed right-2 top-1.5 cursor-pointer text-black/50 rounded-full px-0.5 py-0.2 hover:bg-black/5 transition-colors" onclick="addStickyNote(); event.stopPropagation();">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>
    `;
    noteEl.innerHTML = innerContent;

    // Attach drag/resize
    new DraggableResizable(noteEl, 
        (newX, newY) => {
            updateStickyNotePosition(note.id, newX, newY, note.width, note.height);
        },
        (newWidth, newHeight, newX, newY) => {
            updateStickyNotePosition(note.id, newX, newY, newWidth, newHeight);
        }
    );

    noteEl.querySelector('textarea').addEventListener('input', (e) => {
        const noteId = parseInt(e.target.dataset.noteId);
        const index = state.stickyNotes.findIndex(n => n.id === noteId);
        if (index !== -1) {
            state.stickyNotes[index].text = e.target.value;
        }
    });

    return noteEl;
}

/**
 * Creates the HTML for a frame.
 */
const createFrameElement = (frame) => {
    // Frame Container (simulating Rnd)
    const frameEl = document.createElement('div');
    frameEl.className = `draggable-resizable-box bg-white border z-10 custom-rnd border-gray-300 rounded-lg relative overflow-hidden`;
    frameEl.dataset.id = frame.id;
    frameEl.style.width = `${frame.width}px`;
    frameEl.style.height = `${frame.height}px`;
    frameEl.style.left = `${frame.x}px`;
    frameEl.style.top = `${frame.y}px`;

    // Canvas
    const canvasEl = document.createElement('canvas');
    canvasEl.className = 'absolute inset-0 w-full h-full';
    frameEl.appendChild(canvasEl);
    
    // Initialize Canvas Drawer
    canvasDrawers[frame.id] = new CanvasDrawer(canvasEl, frame.width, frame.height);


    // Header (simulating the separate title element)
    const headerEl = document.createElement('div');
    headerEl.className = 'frame-header flex justify-between items-center absolute px-2 py-1 font-normal text-sm font-inter bg-white/70 backdrop-blur-sm z-20';
    headerEl.dataset.id = frame.id; // Allow dragging by header
    headerEl.style.width = `${frame.width}px`;
    headerEl.style.left = `${frame.x}px`;
    headerEl.style.top = `${frame.y - 28}px`;

    const headerContent = `
        <input type="text" value="${frame.title}" placeholder="Frame Title" class="focus:outline-none focus:ring-0 bg-transparent" data-frame-id="${frame.id}" />
        <i class="fa-solid fa-plus text-gray-400 hover:text-blue-500 cursor-pointer" onclick="addFrame(); event.stopPropagation();"></i>
    `;
    headerEl.innerHTML = headerContent;

    headerEl.querySelector('input').addEventListener('input', (e) => {
        const frameId = parseInt(e.target.dataset.frameId);
        const index = state.frames.findIndex(f => f.id === frameId);
        if (index !== -1) {
            state.frames[index].title = e.target.value;
        }
    });
    
    // Attach drag/resize to frame
    new DraggableResizable(frameEl,
        (newX, newY) => {
            updateFramePosition(frame.id, newX, newY, frame.width, frame.height);
            // Move header element with the frame
            headerEl.style.left = `${newX}px`;
            headerEl.style.top = `${newY - 28}px`;
        },
        (newWidth, newHeight, newX, newY) => {
            updateFramePosition(frame.id, newX, newY, newWidth, newHeight);
            // Resize header element with the frame
            headerEl.style.width = `${newWidth}px`;
        }
    );

    return { frameEl, headerEl };
}


/**
 * Main rendering function to update the whiteboard.
 */
const renderWhiteboard = () => {
    whiteboard.innerHTML = ''; // Clear existing elements

    // Render Frames and their Headers
    state.frames.forEach(frame => {
        const { frameEl, headerEl } = createFrameElement(frame);
        whiteboard.appendChild(headerEl);
        whiteboard.appendChild(frameEl);
        
        // Render Sticky Notes INSIDE this frame
        state.stickyNotes
            .filter(n => n.parentFrame === frame.id)
            .forEach(note => {
                const noteEl = createStickyNoteElement(note);
                // Position is relative to the frame
                noteEl.style.left = `${note.x}px`;
                noteEl.style.top = `${note.y}px`;
                frameEl.appendChild(noteEl);
            });

        // Re-initialize canvas drawing after append (re-initialization is needed due to innerHTML clear)
        if (canvasDrawers[frame.id]) {
            canvasDrawers[frame.id].initializeCanvas();
        }
    });

    // Render Sticky Notes OUTSIDE frames (parentFrame === null)
    state.stickyNotes
        .filter(n => n.parentFrame === null)
        .forEach(note => {
            const noteEl = createStickyNoteElement(note);
            // Position is absolute on the 14000x14000 board
            noteEl.style.left = `${note.x}px`;
            noteEl.style.top = `${note.y}px`;
            whiteboard.appendChild(noteEl);
        });

    // Update toolbar button states
    [toolMouse, toolPen, toolEraser].forEach(btn => {
        btn.classList.remove('bg-blue-200');
    });
    const activeBtn = document.getElementById(`tool-${state.activeTool}`);
    if (activeBtn) activeBtn.classList.add('bg-blue-200');

    // Update popups
    penPopup.classList.add('hidden');
    eraserPopup.classList.add('hidden');
    if (state.openToolPopup === 'pen') {
        penPopup.classList.remove('hidden');
    } else if (state.openToolPopup === 'eraser') {
        eraserPopup.classList.remove('hidden');
    }

    // Update custom color preview
    document.getElementById('custom-color-preview').style.backgroundColor = state.penColor;
};

// --- Action Handlers ---

const addFrame = () => {
    const width = 600;
    const height = 400;

    const scrollLeft = containerRef.scrollLeft;
    const scrollTop = containerRef.scrollTop;
    const containerWidth = containerRef.clientWidth;
    const containerHeight = containerRef.clientHeight;

    const x = scrollLeft + containerWidth / 2 - width / 2 + (Math.random() * 100 - 50);
    const y = scrollTop + containerHeight / 2 - height / 2 + (Math.random() * 100 - 50);

    const newFrame = {
        id: state.nextFrameId++,
        x: Math.round(x),
        y: Math.round(y),
        width,
        height,
        title: `Board ${state.frames.length + 1}`,
    };
    state.frames.push(newFrame);
    renderWhiteboard();
};

const addStickyNote = () => {
    const width = 150;
    const height = 120;

    const scrollLeft = containerRef.scrollLeft;
    const scrollTop = containerRef.scrollTop;
    const containerWidth = containerRef.clientWidth;
    const containerHeight = containerRef.clientHeight;

    const x = scrollLeft + containerWidth / 2 - width / 2 + (Math.random() * 100 - 50);
    const y = scrollTop + containerHeight / 2 - height / 2 + (Math.random() * 100 - 50);

    const newNote = {
        id: state.nextNoteId++,
        x: Math.round(x),
        y: Math.round(y),
        width,
        height,
        text: "New Note",
        parentFrame: null,
    };
    state.stickyNotes.push(newNote);
    renderWhiteboard();
};

const handleToolClick = (toolName) => {
    if (state.activeTool === toolName) {
        state.activeTool = "mouse"; // Toggle off
        state.openToolPopup = null;
    } else {
        state.activeTool = toolName; // Toggle on
        state.openToolPopup = toolName;
    }
    renderWhiteboard();
};

// --- Event Listeners and Initial Setup ---

// Mouse Movement for Custom Cursor
containerRef.addEventListener('mousemove', (e) => {
    state.cursorPos = { x: e.clientX, y: e.clientY };
    customCursor.style.left = `${state.cursorPos.x}px`;
    customCursor.style.top = `${state.cursorPos.y}px`;
});

// Sidebar Toggle
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'c') {
        state.isChatOpen = !state.isChatOpen;
        sidebar.style.width = state.isChatOpen ? '300px' : '0px';
        sidebar.style.overflow = state.isChatOpen ? 'visible' : 'hidden';
    }
});
document.getElementById('toggle-sidebar').addEventListener('click', () => {
    state.isChatOpen = !state.isChatOpen;
    sidebar.style.width = state.isChatOpen ? '300px' : '0px';
    sidebar.style.overflow = state.isChatOpen ? 'visible' : 'hidden';
});

// Toolbar Listeners
toolMouse.addEventListener('click', () => {
    state.activeTool = "mouse";
    state.openToolPopup = null;
    renderWhiteboard();
});
toolAddFrame.addEventListener('click', addFrame);
toolAddNote.addEventListener('click', addStickyNote);
toolPen.addEventListener('click', () => handleToolClick("pen"));
toolEraser.addEventListener('click', () => handleToolClick("eraser"));


// Pen Popup Setup
const penPresetColors = [
    "#1a1a1a", "#e63946", "#f1faee", "#a8dadc", "#457b9d",
    "#ffb703", "#fb8500", "#8338ec", "#3a86ff", "#06d6a0",
];
penPresetColors.forEach(color => {
    const colorEl = document.createElement('div');
    colorEl.className = `w-6 h-6 flex-shrink-0 rounded-full border-2 cursor-pointer transition hover:scale-110`;
    colorEl.style.backgroundColor = color;
    colorEl.title = color;
    colorEl.addEventListener('click', () => {
        state.penColor = color;
        // Also update the color picker input
        penColorPicker.value = color; 
        document.getElementById('custom-color-preview').style.backgroundColor = color;
        renderWhiteboard();
    });
    penColorsContainer.appendChild(colorEl);
});

penColorPicker.addEventListener('input', (e) => {
    state.penColor = e.target.value;
    document.getElementById('custom-color-preview').style.backgroundColor = e.target.value;
});
penColorPicker.addEventListener('change', renderWhiteboard);


const penBrushSizes = [2, 5, 10, 20];
penBrushSizes.forEach(size => {
    const sizeEl = document.createElement('div');
    const sizeMap = { 2: 'w-2 h-2', 5: 'w-3 h-3', 10: 'w-4 h-4', 20: 'w-5 h-5' };
    sizeEl.className = `rounded-full flex-shrink-0 bg-gray-500 hover:scale-110 hover:bg-gray-700 transition cursor-pointer ${sizeMap[size]}`;
    sizeEl.addEventListener('click', () => {
        state.penSize = size;
        renderWhiteboard();
    });
    penSizesContainer.appendChild(sizeEl);
});

// Eraser Popup Setup
const eraserSizes = [10, 20, 30];
eraserSizes.forEach(size => {
    const sizeEl = document.createElement('div');
    const sizeMap = { 10: 'w-3 h-3', 20: 'w-4 h-4', 30: 'w-5 h-5' };
    sizeEl.className = `bg-gray-500 rounded-full cursor-pointer hover:scale-110 hover:bg-gray-700 transition ${sizeMap[size]}`;
    sizeEl.addEventListener('click', () => {
        state.eraserSize = size;
        renderWhiteboard();
    });
    eraserSizesContainer.appendChild(sizeEl);
});


// Initial Whiteboard Setup
window.onload = () => {
    const width = 800;
    const height = 500;
    const centerX = (14000 - width) / 2;
    const centerY = (14000 - height) / 2;

    state.frames.push({
        id: state.nextFrameId++,
        x: Math.round(centerX),
        y: Math.round(centerY),
        width,
        height,
        title: "Board 1",
    });

    renderWhiteboard();

    // Scroll to center
    containerRef.scrollLeft = centerX - containerRef.clientWidth / 2 + width / 2;
    containerRef.scrollTop = centerY - containerRef.clientHeight / 2 + height / 2;
};