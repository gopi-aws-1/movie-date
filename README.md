# Virtual Cinema (Movie Date)

A private, peer-to-peer "virtual living room" for watching movies with a friend. The host shares a tab (with system audio) and the viewer receives the stream directly via WebRTC while Supabase Realtime handles signaling.

## Features
- Create or join a private room and share invite links.
- Host screen share with system audio for Netflix or any tab.
- Peer-to-peer WebRTC via `simple-peer` with Supabase Realtime signaling.
- Voice and camera chat with mute/hide toggles during playback.
- Tailwind-powered dark, immersive UI with responsive layout.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. (Recommended) Provide Supabase credentials by creating `.env`:
   ```bash
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
   - Without these keys the app still works for local tests using two tabs in the same browser via the built-in BroadcastChannel fallback.
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Create a room, share the invite link, and click **Start Broadcast** to share your Netflix tab with audio.

## How to Test Locally
- Use two browser contexts (e.g., a normal window + incognito or two devices) so you can act as both host and viewer.
- Start the dev server with `npm run dev` and open the printed local URL in both contexts.
- In window A (host), click **Create Room** and copy the generated invite link.
- In window B (viewer), paste the invite link to join the same room.
- Back in window A, click **Start Broadcast**, choose the Netflix/tab window, and check the **Share tab audio** option when prompted.
- Confirm window B shows the shared video with audio. Use the mic/camera toggles in both windows to verify voice chat signaling.
- If you don't have Supabase keys, open two tabs of the same browser. The app will automatically use local tab-to-tab signaling so you can verify screen share and audio without extra setup.

## Notes
- Screen sharing requests system audio so your movie audio is forwarded.
- Voice/camera toggles request microphone/camera access and add tracks to the active peer connection.
- Supabase is only used for signaling; streaming stays peer-to-peer for privacy.
