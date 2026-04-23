# AI-FACE-DETECTION
Ai intruder detector for unauthorised access.
# CCTV AI Security Hub

A real-time AI-powered face detection and security monitoring web application. This system utilizes advanced facial recognition algorithms to detect unauthorized individuals, verify liveness, and trigger automated security responses. Developed by **DARK**.

## Features

- **Real-Time Face Recognition:** Matches faces against a secure database of known individuals using `face-api.js`.
- **Intruder Detection:** Automatically identifies unauthorized persons and triggers a "SECURITY BREACH" alarm, complete with a flashing red screen alert.
- **Liveness Detection:** Prevents spoofing attacks by requiring users to blink, verifying they are physically present using Eye Aspect Ratio (EAR) calculations.
- **Automated Intruder Logging & Capture:** Automatically captures and downloads a snapshot image when a new intruder is detected.
- **Audio Alarm System:** Configurable loud beeping alarm upon detecting an unauthorized person. Includes mute/unmute controls.
- **SOS Emergency System:** Automatic SOS dispatch when an intruder is detected, plus a manual SOS trigger button for instant alerts.
- **System Log Feed:** A real-time threat feed that logs system status, camera changes, and security events.
- **Camera Selection:** Supports multiple video inputs, allowing users to switch between available webcams easily.
- **Responsive UI & Themes:** A modern, glassmorphic dashboard with both Dark and Light theme options.

## Technologies Used

- **Frontend:** HTML5, CSS3 (Modern Glassmorphism UI), Vanilla JavaScript
- **AI/ML:** [face-api.js](https://github.com/justadudewhohacks/face-api.js/) (TensorFlow.js based)
- **Models Used:** 
  - `tinyFaceDetector` (Fast, real-time face tracking)
  - `faceLandmark68Net` (Detects 68 face landmark points for blink detection)
  - `faceRecognitionNet` (Computes face descriptors for identity matching)

## Setup and Installation

1. **Clone or Download** the repository to your local machine.
2. **Models Directory:** Ensure the `models` folder contains the required `face-api.js` model weights:
   - `tiny_face_detector_model-weights_manifest.json` / `.shard`
   - `face_landmark_68_model-weights_manifest.json` / `.shard`
   - `face_recognition_model-weights_manifest.json` / `.shard`
3. **Known Faces:** Place images of authorized individuals in the `known_faces/` directory. By default, the script looks for `g.jpeg` and `s.jpeg`. You can update the `loadKnownFaces()` function in `script.js` to match your own files.
4. **Run the Application:** 
   - Because of browser security restrictions regarding camera access and local file loading (CORS), **do not open `index.html` directly**.
   - Serve the project folder using a local web server (e.g., VS Code Live Server, Python's `http.server`, or Node.js `http-server`).
   - Example using Python:
     ```bash
     python -m http.server 8000
     ```
   - Then navigate to `http://localhost:8000` in your web browser.

## How to Use

1. **Grant Camera Permissions:** When prompted by your browser, allow access to your camera.
2. **Initialize:** The system will automatically load the AI models, analyze the known faces, and arm the system.
3. **Controls:**
   - **Start/Stop Detection:** Toggle the face tracking logic.
   - **Camera Switch:** Use the dropdown menu to switch between connected webcams or CCTV feeds.
   - **Alarm On/Off:** Mute or unmute the audio siren.
   - **SOS:** Trigger an emergency alert manually.
   - **Theme Toggle:** Switch between light and dark modes using the sun/moon icon.

## Security Disclaimer

This application is built as a web-based prototype. For production deployment, ensure the system runs over HTTPS to guarantee secure camera streams and incorporate a secure backend server for managing authorized face signatures, logs, and SOS dispatches.
