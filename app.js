// app.js

const scheduler = new Scheduler();

// Timer state
let timerInterval = null;
let currentTaskId = null;
let timerStartTime = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check if the page is being reloaded with timer active
    const savedTimer = JSON.parse(localStorage.getItem('activeTimer'));
    if (savedTimer && savedTimer.taskId) {
        currentTaskId = savedTimer.taskId;
        timerStartTime = new Date(savedTimer.startTime);
        startTimer(currentTaskId);
    }

    scheduler.loadData();
    displayFixedBlocks();
    displayPendingTasks();
    displayDailySchedule(new Date());

    // Update the date display
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // --- Event Listeners ---

    // Fixed Block Form Submission
    document.getElementById('fixed-block-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const day = document.getElementById('fb-day').value;
        const description = document.getElementById('fb-description').value;
        const startTime = document.getElementById('fb-start-time').value;
        const endTime = document.getElementById('fb-end-time').value;

        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
            alert("End time must be after start time for fixed blocks.");
            return;
        }
        
        const newBlock = new FixedBlock(null, day, description, startHour, startMinute, endHour, endMinute);
        scheduler.addFixedBlock(newBlock);
        displayFixedBlocks();
        displayDailySchedule(new Date());
        e.target.reset();
    });

    // Task Form Submission
    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('task-name').value;
        const description = document.getElementById('task-description').value;
        const priority = document.getElementById('task-priority').value;
        const deadline = new Date(document.getElementById('task-deadline').value);
        const estimatedTime = parseInt(document.getElementById('task-estimated-time').value);
        const type = document.getElementById('task-type').value;

        if (isNaN(estimatedTime) || estimatedTime <= 0) {
            alert("Please enter a valid estimated time in minutes (must be a positive number).");
            return;
        }
        if (deadline < new Date()) {
            alert("Deadline cannot be in the past.");
            return;
        }

        const newTask = new Task(null, name, description, priority, deadline, estimatedTime, type);
        scheduler.addTask(newTask);
        displayPendingTasks();
        displayDailySchedule(new Date());
        e.target.reset();
    });
    
    // View all tasks button
    document.getElementById('view-all-tasks-btn').addEventListener('click', () => {
        const section = document.getElementById('all-tasks-section');
        const pendingSection = document.getElementById('pending-tasks-section');
        
        // Toggle visibility
        if (section.style.display === 'block') {
            section.style.display = 'none';
            pendingSection.style.display = 'block';
        } else {
            section.style.display = 'block';
            pendingSection.style.display = 'none';
            displayAllTasks(); // Render the full list
        }
    });

    // Stop timer button
    document.getElementById('stop-timer-btn').addEventListener('click', stopTimer);
});

// --- Display Functions ---

function displayFixedBlocks() {
    const list = document.getElementById('fixed-blocks-list');
    list.innerHTML = '';
    if (scheduler.fixedBlocks.length === 0) {
        list.innerHTML = '<p>No fixed blocks added yet.</p>';
        return;
    }
    scheduler.fixedBlocks.forEach(block => {
        const item = document.createElement('li');
        item.classList.add('fixed-block-item');
        const startTimeStr = String(block.startHour).padStart(2, '0') + ':' + String(block.startMinute).padStart(2, '0');
        const endTimeStr = String(block.endHour).padStart(2, '0') + ':' + String(block.endMinute).padStart(2, '0');
        const dayDisplay = block.dayOfWeek === 'ALL_DAYS' ? 'Every Day' : block.dayOfWeek;
        item.innerHTML = `
            <span>${dayDisplay}: <strong>${block.description}</strong> (${startTimeStr} - ${endTimeStr})</span>
            <button class="delete-btn" onclick="deleteFixedBlockAndRefresh('${block.id}')">Delete</button>
        `;
        list.appendChild(item);
    });
}

function displayPendingTasks() {
    const list = document.getElementById('pending-tasks-list');
    list.innerHTML = '';
    const pending = scheduler.tasks.filter(task => !task.isCompleted);
    if (pending.length === 0) {
        list.innerHTML = '<p>No pending tasks! Good job!</p>';
        return;
    }
    pending.forEach(task => {
        const item = document.createElement('li');
        item.classList.add('task-item');
        item.innerHTML = `
            <span><strong>${task.name}</strong> (Priority: ${task.priority}, Due: ${task.deadline.toLocaleString()}, Remaining: ${task.remainingMinutes} min)</span>
            <button class="delete-btn" onclick="deleteTaskAndRefresh('${task.id}')">Delete</button>
        `;
        list.appendChild(item);
    });
}

function displayAllTasks() {
    const list = document.getElementById('all-tasks-list');
    list.innerHTML = '';
    if (scheduler.tasks.length === 0) {
        list.innerHTML = '<p>No tasks added yet.</p>';
        return;
    }
    scheduler.tasks.forEach(task => {
        const item = document.createElement('li');
        item.classList.add('task-item');
        const status = task.isCompleted ? 'Completed' : 'Pending';
        item.innerHTML = `
            <span><strong>${task.name}</strong> (${status}) - ${task.description}</span>
            <button class="delete-btn" onclick="deleteTaskAndRefresh('${task.id}')">Delete</button>
        `;
        if (task.isCompleted) {
            item.style.opacity = '0.7'; // Style completed tasks
        }
        list.appendChild(item);
    });
}

function displayDailySchedule(date) {
    document.getElementById('current-date').textContent = date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const scheduleContainer = document.getElementById('daily-schedule');
    scheduleContainer.innerHTML = '';

    const generatedSchedule = scheduler.generateDailySchedule(date);

    if (generatedSchedule.length === 0) {
        scheduleContainer.innerHTML = '<p>No schedule generated for this day. Add some tasks and fixed blocks!</p>';
        return;
    }

    generatedSchedule.forEach(activity => {
        const activityDiv = document.createElement('div');
        // Use a more generic class for styling and a specific one for type
        activityDiv.classList.add('schedule-item', `schedule-item-${activity.type.toLowerCase().replace('_', '-')}`);

        const startTime = new Date(activity.startMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(activity.endMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let content = `<span><strong>${activity.name}</strong> (${startTime} - ${endTime})</span>`;

        if (activity.type === 'TASK' && activity.taskId) {
            const originalTask = scheduler.tasks.find(t => t.id === activity.taskId);
            if (originalTask && !originalTask.isCompleted) {
                content += `<button onclick="startTaskTimer('${activity.taskId}')">Start Task</button>`;
            }
        }
        activityDiv.innerHTML = content;
        scheduleContainer.appendChild(activityDiv);
    });
}

// --- Action Handlers (called from HTML buttons) ---

function markTaskCompletedAndRefresh(taskId) {
    if (scheduler.markTaskCompleted(taskId)) {
        displayPendingTasks();
        displayDailySchedule(new Date());
    }
}

function deleteFixedBlockAndRefresh(blockId) {
    scheduler.deleteFixedBlock(blockId);
    displayFixedBlocks();
    displayDailySchedule(new Date());
}

function deleteTaskAndRefresh(taskId) {
    scheduler.deleteTask(taskId);
    displayPendingTasks();
    displayDailySchedule(new Date());
}

// --- Timer Logic ---

function startTaskTimer(taskId) {
    // Prevent multiple timers
    if (timerInterval) {
        alert("A timer is already running. Please stop it first.");
        return;
    }

    const task = scheduler.tasks.find(t => t.id === taskId);
    if (!task) return;

    currentTaskId = taskId;
    timerStartTime = new Date();
    
    // Save timer state to localStorage in case of a refresh
    localStorage.setItem('activeTimer', JSON.stringify({
        taskId: currentTaskId,
        startTime: timerStartTime
    }));

    const timerDisplay = document.getElementById('task-timer-display');
    timerDisplay.style.display = 'block';

    timerInterval = setInterval(() => {
        const elapsedTimeMillis = Date.now() - timerStartTime.getTime();
        const elapsedMinutes = Math.floor(elapsedTimeMillis / (60 * 1000));
        const elapsedSeconds = Math.floor((elapsedTimeMillis % (60 * 1000)) / 1000);
        
        timerDisplay.innerHTML = `
            <h2>Timer: ${task.name}</h2>
            <span>Time Elapsed: ${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSeconds).padStart(2, '0')}</span>
            <br>
            <span>Remaining: ${Math.max(0, task.remainingMinutes - elapsedMinutes)} min</span>
        `;
    }, 1000);
}

function stopTimer() {
    if (!timerInterval) return;

    clearInterval(timerInterval);
    timerInterval = null;
    localStorage.removeItem('activeTimer');
    
    if (currentTaskId) {
        const task = scheduler.tasks.find(t => t.id === currentTaskId);
        if (task) {
            const elapsedTimeMillis = Date.now() - timerStartTime.getTime();
            const elapsedMinutes = Math.floor(elapsedTimeMillis / (60 * 1000));
            task.remainingMinutes = Math.max(0, task.remainingMinutes - elapsedMinutes);
            
            // Check for completion
            if (task.remainingMinutes <= 0) {
                markTaskCompletedAndRefresh(task.id);
            } else {
                 scheduler.saveData();
                 displayDailySchedule(new Date());
            }
        }
    }

    currentTaskId = null;
    timerStartTime = null;
    document.getElementById('task-timer-display').style.display = 'none';
    document.getElementById('task-timer-display').innerHTML = '';
}

