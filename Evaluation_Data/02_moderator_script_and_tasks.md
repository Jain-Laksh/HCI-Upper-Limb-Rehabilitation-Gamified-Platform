# Moderator Script and Task Sheet

**Method:** task-based usability test with concurrent **think-aloud**, in a **controlled setting**. Also: post-test questionnaire (SUS, SEQ per task, Borg CR10, dignity items) and a short semi-structured interview.

**Setting:** quiet room, laptop on a table, built-in webcam, chair 1.5–2 m from the screen, good front lighting, Chrome browser in full screen, volume at a comfortable level.

**Roles:** one moderator (reads the script, never helps unless asked twice or the participant is stuck for more than 60 s); one observer (fills `observation_log.csv`, times each task).

**Participants:**
- Target: 5–8. Ideally 2–3 older adults (60+) and the rest proxy users (students or staff). Record `group` = `older` or `proxy`.
- If possible, add 1 expert (physiotherapist or doctor) who reviews the exercise paths in Expert mode. Record as `group` = `expert`.

## Before the participant arrives
1. Open Settings, choose **Reset all settings**, then *My progress → Delete all history* (fresh state).
2. Set the language to the participant's preference.
3. Leave voice commands **on** (internet needed) for task 5.
4. Prepare the paper questionnaire and the timer.

## Script (read aloud)
> "Thank you for helping us. We are testing a game that helps people exercise their arm at home. We are testing the game, not you, so there are no wrong answers. Please say out loud what you are thinking as you go: what you look at, what you expect, and anything confusing. If you feel any discomfort, tell us and we stop straight away. Nothing is recorded on camera. Shall we begin?"

Ask for a **Borg CR10 rating before starting** (0 = no effort, 10 = maximal).

## Tasks
After each task, ask the **SEQ**: *"Overall, how easy or difficult was that task, from 1 (very difficult) to 7 (very easy)?"*

| # | Task given to the participant | Success criterion | Observe / record |
|---|---|---|---|
| T1 | "Please start the game and get ready to work as a painter." | Reaches the calibration screen with all checks green | Time; confusion at setup checks; whether they understand the distance meter |
| T2 | "Follow the measuring step." | Calibration completes | Did they understand "arm out to the side"? Number of retries |
| T3 | "Complete the training day." | Reaches "You are ready" | First dwell-select success; understanding of the tape and the reset explanation |
| T4 | "Paint the first wall." | Wall finished | Stroke resets (and their reasons); tracking losses; comments about the brush mapping |
| T5 | "Take a break, then carry on." (do not say how) | Pauses **and** resumes | Which modality they used (button / space bar / voice); time |
| T6 | "The text is a bit small for you. Make it bigger, then come back to work." | Text size changed; back in the shift | Did they find Settings; navigation errors |
| T7 | "Finish your shift and tell me how much you earned and how your arm did." | Correctly reads the total and one movement number | Understanding of the pay slip versus the exercise summary |

Click **Export session data** on the pay slip and save the JSON as `raw/P#_session.json`.

## Optional: angle validation (3 participants are enough)
Use a phone goniometer app (or a protractor) held at the shoulder. Turn on *Settings → Advanced → Show measurements*. The participant holds each pose for 3 s:
1. Side raise at about 45°.
2. Side raise at about 90°.
3. Forward raise at about 45°.
4. Forward raise at about 90°.

Record the goniometer angle and the app's 3D and 2D values in `angle_validation.csv`.

## After the tasks
1. Borg CR10 rating **after**.
2. Questionnaire (`03_questionnaire.md`).
3. Interview, 3–5 minutes:
   - "What did you like most? What was most confusing?"
   - "How did the painter idea feel to you? Did anything feel childish or patronising?"
   - "Which way of controlling it did you prefer: hand, mouse, voice or keyboard? Why?"
   - "Would you use something like this at home? What would stop you?"
4. Thank them. Remind them that their data is anonymous.

## Stop rules (safety)
Stop the session immediately if the participant reports pain, dizziness or breathlessness, or appears distressed or fatigued (Borg ≥ 5 during the session). Offer water and rest. Record the stop in the notes.
