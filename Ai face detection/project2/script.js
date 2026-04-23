const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const logList = document.getElementById("log-list")
const statusBadge = document.getElementById("status-badge")
const statusText = document.getElementById("status-text")
let isAlerting = false;
let detectionActive = false;
let detectionInterval = null;
let alarmMuted = false;
let intruderCount = 0;
let currentStream = null;
let recordedIntruderDescriptors = []; // Global database for unique intruders detected this session
let isSosActive = false; // State for SOS alert

// --- Liveness Detection Variables ---
const EAR_THRESHOLD = 0.27; // Threshold to consider an eye closed
let trackedFaces = []; // Stores { id, x, y, isLive, consecutiveClosedFrames, lastSeen }
let nextFaceId = 0;

function getDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calculateEAR(eye) {
    // According to facial landmarks for eye points
    const v1 = getDistance(eye[1], eye[5]);
    const v2 = getDistance(eye[2], eye[4]);
    const h = getDistance(eye[0], eye[3]);
    if (h === 0) return 0;
    return (v1 + v2) / (2.0 * h);
}
// ------------------------------------

// --- Audio Alarm Logic ---
let audioCtx = null;
let beepInterval = null;

function playBeep() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) { return; }
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800 Hz
    
    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); // Volume
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
}

function startAlarm() {
    if (beepInterval || alarmMuted) return;
    playBeep();
    beepInterval = setInterval(playBeep, 800);
}

function stopAlarm() {
    if (beepInterval) {
        clearInterval(beepInterval);
        beepInterval = null;
    }
}

function toggleMute() {
    alarmMuted = !alarmMuted;
    const btn = document.getElementById("mute-btn");
    if (!btn) return;
    if (alarmMuted) {
        stopAlarm();
        btn.textContent = "🔇 Alarm Off";
        btn.classList.add("btn-muted");
        btn.classList.remove("btn-unmuted");
        addLog("Alarm muted.");
    } else {
        btn.textContent = "🔊 Alarm On";
        btn.classList.add("btn-unmuted");
        btn.classList.remove("btn-muted");
        // Re-trigger alarm immediately if a breach is still active
        if (isAlerting) startAlarm();
        addLog("Alarm unmuted.");
    }
}

function updateControlBtn() {
    const btn = document.getElementById("control-btn");
    if (!btn) return;
    if (detectionActive) {
        btn.textContent = "⏹ Stop Detection";
        btn.classList.add("btn-stop");
        btn.classList.remove("btn-start");
    } else {
        btn.textContent = "▶ Start Detection";
        btn.classList.add("btn-start");
        btn.classList.remove("btn-stop");
    }
}

function toggleDetection() {
    detectionActive = !detectionActive;
    updateControlBtn();

    if (!detectionActive) {
        // Clear canvas and stop alarm when paused
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        stopAlarm();
        if (isAlerting) {
            isAlerting = false;
            statusBadge.classList.replace("alert", "ready");
            document.body.classList.remove("screen-alert");
        }
        trackedFaces = [];
        statusText.innerText = "Detection Paused";
        addLog("Detection manually stopped.");
        
        // Reset SOS
        if (isSosActive) {
            isSosActive = false;
            const sosBtn = document.getElementById("sos-btn");
            if (sosBtn) {
                sosBtn.classList.remove("active");
                sosBtn.innerText = "🚨 SOS";
            }
        }
    } else {
        statusText.innerText = "System Armed";
        addLog("Detection manually started.");
    }
}

// --- SOS Logic ---
function triggerSOS(isManual = false) {
    if (isSosActive) return; // Prevent duplicate SOS
    isSosActive = true;
    
    // Update UI
    const sosBtn = document.getElementById("sos-btn");
    if (sosBtn) {
        sosBtn.classList.add("active");
        sosBtn.innerText = "🚨 SOS ACTIVE";
    }

    addLog(`🚨 SOS DISPATCHED (${isManual ? 'Manual' : 'System Auto'}): Alerting Head of Company and Security...`, true);

    // Activate alarms
    if (!isAlerting) {
        isAlerting = true;
        statusBadge.classList.replace("ready", "alert");
        statusText.innerText = "EMERGENCY SOS";
        startAlarm();
        document.body.classList.add("screen-alert");
    }

    // Simulate sending network requests for messages
    setTimeout(() => {
        addLog(`✅ SOS DELIVERED: Message received by Head of Company.`, true);
    }, 2000);
    setTimeout(() => {
        addLog(`✅ SOS DELIVERED: Details sent to Security Team.`, true);
    }, 3500);
}
// -------------------------

// --- Theme Toggle Logic ---
const themeToggle = document.getElementById("theme-toggle");
const currentTheme = localStorage.getItem("theme") || "dark";
if (currentTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
}

themeToggle.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
    }
});
// --------------------------

function captureIntruderImage(box) {
    if (!video || video.paused || video.ended) return null;
    
    const hiddenCanvas = document.createElement("canvas");
    const ctx = hiddenCanvas.getContext("2d");
    
    // Calculate cropped dimensions with padding
    const padding = 40;
    const sx = Math.max(0, box.x - padding);
    const sy = Math.max(0, box.y - padding);
    
    // Ensure we don't exceed video boundaries
    const sw = Math.min(video.videoWidth - sx, box.width + padding * 2);
    const sh = Math.min(video.videoHeight - sy, box.height + padding * 2);
    
    hiddenCanvas.width = sw;
    hiddenCanvas.height = sh;
    
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = hiddenCanvas.toDataURL("image/jpeg", 0.9);
    
    // Auto download
    const a = document.createElement("a");
    a.href = dataUrl;
    const timeStr = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `intruder_${timeStr}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    return dataUrl;
}

function addLog(message, isAlert = false, imageUrl = null) {
    const li = document.createElement("li")
    const time = new Date().toLocaleTimeString('en-US', { hour12: false })
    
    let htmlContent = `[${time}] ${message}`
    if (imageUrl) {
        htmlContent += `<br><img src="${imageUrl}" class="alert-image" alt="Captured Intruder">`
    }
    
    li.innerHTML = htmlContent;
    if (isAlert) li.className = "alert-log"
    logList.prepend(li)
    if (logList.children.length > 20) {
        logList.removeChild(logList.lastChild)
    }
}

async function initModels() {
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri("models"),
            faceapi.nets.faceLandmark68Net.loadFromUri("models"),
            faceapi.nets.faceRecognitionNet.loadFromUri("models")
        ])
        addLog("Neural networks loaded successfully")
        statusText.innerText = "Accessing Camera..."
        await startVideo();
        await populateCameraList();
    } catch (e) {
        addLog("Failed to load models: " + e.message, true)
        statusText.innerText = "Error Loading Models"
        statusBadge.classList.add("alert")
    }
}

function startVideo(deviceId = null) {
    // Stop any existing stream
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }

    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true };
    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            currentStream = stream;
            video.srcObject = stream;
            addLog("Camera stream established");
        })
        .catch(err => {
            addLog("Camera blocked or unavailable", true);
            console.error(err);
            statusText.innerText = "Camera Error";
            statusBadge.classList.add("alert");
        });
}

async function populateCameraList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        const select = document.getElementById("camera-select");
        if (!select) return;
        select.innerHTML = "";
        cameras.forEach((cam, i) => {
            const opt = document.createElement("option");
            opt.value = cam.deviceId;
            opt.text = cam.label || `Camera ${i + 1}`;
            select.appendChild(opt);
        });
        select.addEventListener("change", () => {
            trackedFaces = [];
            startVideo(select.value);
            addLog(`Switched to: ${select.options[select.selectedIndex].text}`);
        });
    } catch (e) {
        console.warn("Could not enumerate cameras:", e);
    }
}

video.addEventListener("play", async () => {
    // Wait until video has intrinsic dimensions
    if (video.videoWidth === 0) {
        setTimeout(() => video.dispatchEvent(new Event('play')), 100);
        return;
    }

    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)

    // UI Updates
    statusBadge.classList.add("ready")
    statusText.innerText = "System Armed"
    document.querySelector('.pulsing-dot').style.animationDuration = '4s'
    addLog("Analyzing known authorized faces...")

    let labeledDescriptors = []
    try {
        labeledDescriptors = await loadKnownFaces()
        addLog("Face signatures stored securely")
    } catch (e) {
        addLog("Error loading reference faces: " + e.message, true)
    }

    const faceMatcher = labeledDescriptors.length > 0
        ? new faceapi.FaceMatcher(labeledDescriptors, 0.6)
        : null

    // Start detection active when video first plays
    detectionActive = true;
    updateControlBtn();

    // Prevent duplicate intervals if 'play' event fires multiple times (e.g., changing cameras)
    if (detectionInterval) clearInterval(detectionInterval);
    
    let isProcessingFrame = false;

    detectionInterval = setInterval(async () => {
        // Prevent overlapping async calls if face detection takes longer than 150ms
        if (!detectionActive || video.paused || video.ended || isProcessingFrame) return;
        
        isProcessingFrame = true;
        try {
            const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

        let unauthorizedDetected = false;
        let livenessPending = false;
        let lastIntruderBox = null;
        let sessionNewIntruderDetected = false; // Tracks if a truly NEW intruder appeared this frame
        const now = Date.now();

        const currentFramesFaces = [];

        resizedDetections.forEach(d => {
            const box = d.detection.box;
            const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            
            let matchedFace = null;
            let minDistance = Infinity;

            trackedFaces.forEach(tf => {
                const dist = getDistance(center, tf);
                if (dist < 100 && dist < minDistance) {
                    minDistance = dist;
                    matchedFace = tf;
                }
            });

            if (!matchedFace) {
                matchedFace = { id: nextFaceId++, x: center.x, y: center.y, isLive: false, consecutiveClosedFrames: 0, consecutiveUnknownFrames: 0, lastSeen: now };
            } else {
                matchedFace.x = center.x;
                matchedFace.y = center.y;
                matchedFace.lastSeen = now;
            }
            
            // Liveness detection (Blink check)
            if (!matchedFace.isLive) {
                const leftEye = d.landmarks.getLeftEye();
                const rightEye = d.landmarks.getRightEye();
                const avgEAR = (calculateEAR(leftEye) + calculateEAR(rightEye)) / 2.0;

                if (avgEAR < EAR_THRESHOLD) {
                    matchedFace.consecutiveClosedFrames++;
                } else if (matchedFace.consecutiveClosedFrames >= 1) {
                    matchedFace.isLive = true;
                    addLog("Liveness confirmed via blink.");
                    matchedFace.consecutiveClosedFrames = 0;
                } else {
                    matchedFace.consecutiveClosedFrames = 0; // reset
                }
            }

            currentFramesFaces.push(matchedFace);

            let label = "unknown";
            let confidence = 0;
            if (faceMatcher) {
                const bestMatch = faceMatcher.findBestMatch(d.descriptor);
                label = bestMatch.toString();
                // Distance: lower = more confident. Convert to %
                confidence = Math.round((1 - Math.min(bestMatch.distance, 1)) * 100);
            }

            const isUnknown = label.includes("unknown");
            
            if (isUnknown) {
                matchedFace.consecutiveUnknownFrames = (matchedFace.consecutiveUnknownFrames || 0) + 1;
            } else {
                matchedFace.consecutiveUnknownFrames = 0;
            }

            const ctx = canvas.getContext("2d");
            ctx.lineWidth = 3;
            ctx.font = "bold 16px Inter";
            
            let boxColor = "#ffffff", statusLabel = "";

            if (isUnknown) {
                boxColor = "#ff2a55"; // Red
                statusLabel = "UNAUTHORIZED";
                
                if (matchedFace.consecutiveUnknownFrames >= 5) {
                    unauthorizedDetected = true;
                    
                    // Check if this specific face fingerprint is new to the session
                    let isAlreadyRecorded = false;
                    for (let recorded of recordedIntruderDescriptors) {
                        // distance <= 0.62 means a similarity match >= 38%
                        const distance = faceapi.euclideanDistance(d.descriptor, recorded);
                        if (distance <= 0.62) {
                            isAlreadyRecorded = true;
                            break;
                        }
                    }

                    if (!isAlreadyRecorded) {
                        recordedIntruderDescriptors.push(d.descriptor);
                        sessionNewIntruderDetected = true; 
                        lastIntruderBox = box; // Capture the box of the NEW intruder
                    }
                }
            } else if (!matchedFace.isLive) {
                livenessPending = true;
                boxColor = "#ffc107"; // Yellow
                statusLabel = "PLEASE BLINK";
            } else {
                boxColor = "#00f0ff"; // Cyan
                statusLabel = "VERIFIED";
            }

            ctx.strokeStyle = boxColor;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            ctx.fillStyle = boxColor;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(box.x, box.y - 25, box.width, 25);
            ctx.globalAlpha = 1.0;

            ctx.fillStyle = "#ffffff";
            const displayLabel = isUnknown
                ? `UNAUTHORIZED`
                : `${statusLabel} ${confidence}%`;
            ctx.fillText(displayLabel, box.x + 5, box.y - 7);
        });

        // Retain faces for ~1000ms if tracking lost momentarily
        const activeIds = currentFramesFaces.map(f => f.id);
        const retainedFaces = trackedFaces.filter(tf => !activeIds.includes(tf.id) && (now - tf.lastSeen < 1000));
        trackedFaces = [...currentFramesFaces, ...retainedFaces];

        if (unauthorizedDetected) {
            // General "Security Breach" status and alarm
            if (!isAlerting) {
                isAlerting = true;
                statusBadge.classList.replace("ready", "alert");
                statusText.innerText = "SECURITY BREACH";
                startAlarm();
                document.body.classList.add("screen-alert");
            }

            // Specific code for NEW intruders only
            if (sessionNewIntruderDetected) {
                intruderCount++;
                document.getElementById("intruder-count").textContent = intruderCount;
                const photoUrl = lastIntruderBox ? captureIntruderImage(lastIntruderBox) : null;
                addLog(`ALERT: New intruder identified! (#${intruderCount})`, true, photoUrl);
                
                // Automatic SOS Trigger
                triggerSOS(false);
            }
        } else if (livenessPending && !unauthorizedDetected) {
            if (!isAlerting) {
                statusText.innerText = "Checking Liveness...";
            }
        } else {
            if (isAlerting) {
                isAlerting = false;
                addLog("Threat cleared. Returning to normal.", false);
                statusBadge.classList.replace("alert", "ready");
                stopAlarm();
                document.body.classList.remove("screen-alert");
            }
            statusText.innerText = "System Armed";
        }
        } catch (e) {
            console.error("Detection error:", e);
        } finally {
            isProcessingFrame = false;
        }
    }, 150)
})

async function loadKnownFaces() {
    const labels = ["g", "s"]

    return Promise.all(
        labels.map(async label => {
            const img = await faceapi.fetchImage(`known_faces/${label}.jpeg`)
            const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor()

            if (!detections) {
                throw new Error(`Could not find a face in ${label}.jpeg`)
            }
            return new faceapi.LabeledFaceDescriptors(label, [detections.descriptor])
        })
    )
}

initModels();