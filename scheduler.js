// Scheduler.js

// Data Structures
class FixedBlock {
    constructor(id, dayOfWeek, description, startHour, startMinute, endHour, endMinute) {
        this.id = id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Unique ID
        this.dayOfWeek = dayOfWeek; // 'MONDAY', 'TUESDAY', 'ALL_DAYS', etc.
        this.description = description;
        this.startHour = startHour;
        this.startMinute = startMinute;
        this.endHour = endHour;
        this.endMinute = endMinute;
    }

    getStartTimeInMinutes() {
        return this.startHour * 60 + this.startMinute;
    }
    getEndTimeInMinutes() {
        return this.endHour * 60 + this.endMinute;
    }
}

class Task {
    constructor(id, name, description, priority, deadline, estimatedMinutes, type, isCompleted = false, scheduledDate = null, remainingMinutes = estimatedMinutes) {
        this.id = id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Unique ID
        this.name = name;
        this.description = description;
        this.priority = priority; // 'LOW', 'MEDIUM', 'HIGH'
        this.deadline = deadline; // Date object
        this.estimatedMinutes = estimatedMinutes; // Total estimated time in minutes
        this.type = type; // 'HOMEWORK', 'ASSIGNMENT', etc.
        this.isCompleted = isCompleted;
        this.scheduledDate = scheduledDate; // The Date object for which day it was last scheduled
        this.remainingMinutes = remainingMinutes; // For broken down tasks
    }
}

class ScheduledActivity {
    constructor(id, type, name, startMillis, endMillis, taskId = null) {
        this.id = id || `sa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.type = type; // 'TASK', 'BREAK', 'REVISION', 'FIXED_BLOCK'
        this.name = name;
        this.startMillis = startMillis; // Unix timestamp
        this.endMillis = endMillis;     // Unix timestamp
        this.taskId = taskId; // Link to original task if applicable
    }
}

// Scheduler Engine
const MILLIS_IN_MINUTE = 60 * 1000;
const MILLIS_IN_HOUR = 60 * MILLIS_IN_MINUTE;
const MILLIS_IN_DAY = 24 * MILLIS_IN_HOUR;

class Scheduler {
    constructor() {
        this.tasks = []; // Array of Task objects
        this.fixedBlocks = []; // Array of FixedBlock objects
    }

    // --- Data Management ---
    loadData() {
        try {
            this.tasks = JSON.parse(localStorage.getItem('tasks') || '[]').map(data => new Task(
                data.id, data.name, data.description, data.priority,
                new Date(data.deadline), data.estimatedMinutes, data.type,
                data.isCompleted, data.scheduledDate ? new Date(data.scheduledDate) : null, data.remainingMinutes
            ));
            this.fixedBlocks = JSON.parse(localStorage.getItem('fixedBlocks') || '[]').map(data => new FixedBlock(
                data.id, data.dayOfWeek, data.description, data.startHour,
                data.startMinute, data.endHour, data.endMinute
            ));
        } catch (e) {
            console.error("Error loading data from localStorage:", e);
            this.tasks = [];
            this.fixedBlocks = [];
        }
        console.log("Data loaded:", this.tasks, this.fixedBlocks);
    }

    saveData() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        localStorage.setItem('fixedBlocks', JSON.stringify(this.fixedBlocks));
        console.log("Data saved.");
    }

    addTask(task) {
        if (task.remainingMinutes === undefined || task.remainingMinutes === null) {
            task.remainingMinutes = task.estimatedMinutes;
        }
        this.tasks.push(task);
        this.saveData();
    }

    addFixedBlock(block) {
        this.fixedBlocks.push(block);
        this.saveData();
    }

    markTaskCompleted(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.isCompleted = true;
            task.remainingMinutes = 0;
            this.saveData();
            return true;
        }
        return false;
    }

    deleteFixedBlock(blockId) {
        this.fixedBlocks = this.fixedBlocks.filter(block => block.id !== blockId);
        this.saveData();
    }

    deleteTask(taskId) {
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.saveData();
    }


    // --- Core Schedule Generation ---
    generateDailySchedule(targetDate) {
        const dayOfWeek = targetDate.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
        
        // --- NEW: Normalize targetDate to start of current time, not start of day
        const nowMillis = Date.now();
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const startOfDayMillis = startOfDay.getTime();
        const endOfDayMillis = startOfDayMillis + MILLIS_IN_DAY - 1;
        
        let scheduledActivities = [];
        
        // Initial available time starts from now, not the start of the day
        let initialAvailableStartMillis = nowMillis;
        if (initialAvailableStartMillis < startOfDayMillis) {
            initialAvailableStartMillis = startOfDayMillis; // In case the clock is off
        }
        
        let availableTimeSlots = [{ start: initialAvailableStartMillis, end: endOfDayMillis }];

        // 1. Mark all fixed blocks, including "ALL_DAYS" and today's day
        const blocksForToday = this.fixedBlocks.filter(block => 
            block.dayOfWeek === dayOfWeek || block.dayOfWeek === 'ALL_DAYS'
        );

        blocksForToday.forEach(fixedBlock => {
            const blockStartMillis = startOfDayMillis + (fixedBlock.startHour * MILLIS_IN_HOUR) + (fixedBlock.startMinute * MILLIS_IN_MINUTE);
            const blockEndMillis = startOfDayMillis + (fixedBlock.endHour * MILLIS_IN_HOUR) + (fixedBlock.endMinute * MILLIS_IN_MINUTE);

            // Add fixed block to scheduled activities only if it's in the future
            if (blockEndMillis > initialAvailableStartMillis) {
                scheduledActivities.push(new ScheduledActivity(
                    null, 'FIXED_BLOCK', fixedBlock.description, blockStartMillis, blockEndMillis
                ));
            }
            
            // Remove this block from available time, regardless of whether it's in the past or future
            availableTimeSlots = this._subtractTime(availableTimeSlots, blockStartMillis, blockEndMillis);
        });

        // 2. Filter and Sort incomplete tasks with remaining time
        let pendingTasks = this.tasks.filter(task => !task.isCompleted && task.remainingMinutes > 0);

        // Sort: High priority > Medium > Low. Then by deadline (earliest first).
        pendingTasks.sort((a, b) => {
            const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            }
            return a.deadline.getTime() - b.deadline.getTime();
        });

        const CHUNK_SIZE_MINUTES = 120; // Default 2 hours for breaking down tasks
        const MIN_TASK_CHUNK_MINUTES = 30; // Minimum chunk size
        const SHORT_BREAK_MINUTES = 5; // 5 minute breaks
        
        // 3. Schedule Tasks
        let tasksForScheduling = pendingTasks.map(task => ({ ...task }));

        tasksForScheduling.forEach(task => {
            let currentTaskRemaining = task.remainingMinutes;
            const now = new Date();
            const timeUntilDeadlineMillis = task.deadline.getTime() - now.getTime();
            const daysUntilDeadline = timeUntilDeadlineMillis / MILLIS_IN_DAY;

            // --- NEW: Logic to spread out tasks based on deadline
            let dailyGoalMinutes;
            if (daysUntilDeadline > 0 && task.remainingMinutes > 0) {
                // Calculate a daily goal. The closer the deadline, the larger the daily goal.
                const bufferDays = 1; // leave one day as buffer
                let effectiveDays = Math.max(1, daysUntilDeadline - bufferDays); 
                dailyGoalMinutes = Math.min(CHUNK_SIZE_MINUTES, Math.ceil(task.remainingMinutes / effectiveDays));
                // Ensure daily goal is at least a minimum size
                dailyGoalMinutes = Math.max(MIN_TASK_CHUNK_MINUTES, dailyGoalMinutes);
            } else {
                dailyGoalMinutes = task.remainingMinutes; // If deadline is today, schedule all remaining time
            }

            // Schedule chunks up to the daily goal
            let scheduledTodayMinutes = 0;

            // Re-sort available slots to prioritize earlier times
            availableTimeSlots.sort((a, b) => a.start - b.start);

            for (let i = 0; i < availableTimeSlots.length && currentTaskRemaining > 0 && scheduledTodayMinutes < dailyGoalMinutes; i++) {
                const slot = availableTimeSlots[i];
                let slotDurationMinutes = (slot.end - slot.start) / MILLIS_IN_MINUTE;
                
                if (slotDurationMinutes <= 0) continue;

                // Determine the chunk size for this slot, limited by daily goal and slot duration
                let potentialChunkMinutes = Math.min(currentTaskRemaining, dailyGoalMinutes - scheduledTodayMinutes, slotDurationMinutes);

                // Ensure chunk is large enough for a meaningful session
                if (potentialChunkMinutes < MIN_TASK_CHUNK_MINUTES) {
                    continue; // Skip if chunk is too small
                }
                
                // Ensure we have enough slot for the task chunk + a break
                if (slotDurationMinutes >= potentialChunkMinutes + SHORT_BREAK_MINUTES) {
                    const chunkStartMillis = slot.start;
                    const chunkEndMillis = chunkStartMillis + (potentialChunkMinutes * MILLIS_IN_MINUTE);

                    scheduledActivities.push(new ScheduledActivity(
                        null, 'TASK', task.name, chunkStartMillis, chunkEndMillis, task.id
                    ));

                    // Add a break immediately after
                    const breakStartMillis = chunkEndMillis;
                    const breakEndMillis = breakStartMillis + (SHORT_BREAK_MINUTES * MILLIS_IN_MINUTE);
                    scheduledActivities.push(new ScheduledActivity(
                        null, 'BREAK', 'Short Break', breakStartMillis, breakEndMillis
                    ));

                    availableTimeSlots = this._subtractTime(availableTimeSlots, chunkStartMillis, breakEndMillis);
                    currentTaskRemaining -= potentialChunkMinutes;
                    scheduledTodayMinutes += potentialChunkMinutes;
                    
                } else if (slotDurationMinutes >= potentialChunkMinutes) {
                    // Fit the chunk without a break if the slot isn't big enough for both
                    const chunkStartMillis = slot.start;
                    const chunkEndMillis = chunkStartMillis + (potentialChunkMinutes * MILLIS_IN_MINUTE);
                    scheduledActivities.push(new ScheduledActivity(
                        null, 'TASK', task.name, chunkStartMillis, chunkEndMillis, task.id
                    ));
                    availableTimeSlots = this._subtractTime(availableTimeSlots, chunkStartMillis, chunkEndMillis);
                    currentTaskRemaining -= potentialChunkMinutes;
                    scheduledTodayMinutes += potentialChunkMinutes;
                }
            }
            
            // Update the actual task's remaining minutes in the main tasks array
            const originalTask = this.tasks.find(t => t.id === task.id);
            if (originalTask) {
                originalTask.remainingMinutes = currentTaskRemaining;
            }
        });
        
        this.saveData(); // Save the updated remainingMinutes for tasks

        // 4. Fill remaining free time with "Revise Old Chapters"
        const REVISION_BLOCK_MINUTES = 60; // 1 hour revision blocks
        const MIN_REVISION_BLOCK_MINUTES = 30; // Minimum size for a revision block

        availableTimeSlots.sort((a, b) => a.start - b.start);

        availableTimeSlots.forEach(slot => {
            let currentSlotRemaining = (slot.end - slot.start) / MILLIS_IN_MINUTE;
            let currentSlotStart = slot.start;

            while (currentSlotRemaining >= MIN_REVISION_BLOCK_MINUTES) {
                let actualRevisionMinutes = Math.min(currentSlotRemaining, REVISION_BLOCK_MINUTES);
                
                const revisionEnd = currentSlotStart + (actualRevisionMinutes * MILLIS_IN_MINUTE);
                scheduledActivities.push(new ScheduledActivity(
                    null, 'REVISION', 'Revise Old Chapters', currentSlotStart, revisionEnd
                ));
                currentSlotStart = revisionEnd;
                currentSlotRemaining -= actualRevisionMinutes;
            }
        });

        scheduledActivities.sort((a, b) => a.startMillis - b.startMillis);

        return scheduledActivities;
    }

    // Helper function to subtract a used time range from available slots
    _subtractTime(availableSlots, startToSubtract, endToSubtract) {
        let newSlots = [];
        availableSlots.forEach(slot => {
            // Case 1: Slot is entirely before the subtracted range
            if (slot.end <= startToSubtract) {
                newSlots.push(slot);
            }
            // Case 2: Slot is entirely after the subtracted range
            else if (slot.start >= endToSubtract) {
                newSlots.push(slot);
            }
            // Case 3: Subtracted range completely covers the slot
            else if (startToSubtract <= slot.start && endToSubtract >= slot.end) {
                // Do nothing, slot is consumed
            }
            // Case 4: Subtracted range splits the slot
            else if (startToSubtract > slot.start && endToSubtract < slot.end) {
                newSlots.push({ start: slot.start, end: startToSubtract });
                newSlots.push({ start: endToSubtract, end: slot.end });
            }
            // Case 5: Subtracted range overlaps the beginning of the slot
            else if (startToSubtract <= slot.start && endToSubtract < slot.end) {
                newSlots.push({ start: endToSubtract, end: slot.end });
            }
            // Case 6: Subtracted range overlaps the end of the slot
            else if (startToSubtract > slot.start && endToSubtract >= slot.end) {
                newSlots.push({ start: slot.start, end: startToSubtract });
            }
        });

        // Clean up: remove zero-duration slots and merge contiguous slots
        newSlots = newSlots.filter(s => (s.end - s.start) > 0);
        newSlots.sort((a, b) => a.start - b.start);

        if (newSlots.length > 1) {
            let merged = [newSlots[0]];
            for (let i = 1; i < newSlots.length; i++) {
                if (merged[merged.length - 1].end === newSlots[i].start) {
                    merged[merged.length - 1].end = newSlots[i].end;
                } else {
                    merged.push(newSlots[i]);
                }
            }
            newSlots = merged;
        }

        return newSlots;
    }
}
