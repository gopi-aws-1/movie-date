import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import SimplePeer from 'simple-peer';
import { nanoid } from 'nanoid';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const generateRoomId = () => `gyo-${nanoid(6)}`;

const buildCompositeStream = (sources) => {
  const stream = new MediaStream();
  sources.forEach((source) => {
    source?.getTracks().forEach((track) => stream.addTrack(track));
  });
  return stream.getTracks().length ? stream : null;
};

const useSupabaseClient = () => {
  return useMemo(() => {
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
  }, []);
};

function App() {
  const [roomId, setRoomId] = useState('');
  const [roomLink, setRoomLink] = useState('');
  const [isHost, setIsHost] = useState(true);
  const [status, setStatus] = useState('Ready to start a private screening.');
  const [channelReady, setChannelReady] = useState(false);
  const [signalingMode, setSignalingMode] = useState('local');
  const [remoteStream, setRemoteStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [micStream, setMicStream] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState('idle');
  const [signalingError, setSignalingError] = useState('');

  const supabase = useSupabaseClient();
  const channelRef = useRef(null);
  const localChannelRef = useRef(null);
  const peerRef = useRef(null);
  const clientId = useMemo(() => nanoid(), []);

  const loadRoomFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
      setRoomLink(window.location.href);
      setIsHost(false);
      setStatus('Joined room from invite link. Waiting for host to start.');
    }
  };

  useEffect(() => {
    loadRoomFromUrl();
  }, []);

  const cleanupStreams = () => {
    screenStream?.getTracks().forEach((track) => track.stop());
    micStream?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
  };

  useEffect(() => () => cleanupStreams(), [screenStream, micStream, cameraStream]);

  useEffect(() => {
    if (!roomId) return;

    if (supabase) {
      setSignalingMode('supabase');
      const channel = supabase.channel(`room:${roomId}`, {
        config: {
          broadcast: { self: false },
        },
      });

      channel
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (!payload || payload.sender === clientId) return;
          if (!peerRef.current) {
            setStatus('Incoming signal detected. Building connection...');
            createPeer(false);
          }
          peerRef.current?.signal(payload.data);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setChannelReady(true);
            setStatus('Signaling ready. Waiting to connect.');
          }
        });

      channelRef.current = channel;

      return () => {
        channel.unsubscribe();
        channelRef.current = null;
        setChannelReady(false);
      };
    }

    setSignalingMode('local');
    const localChannel = new BroadcastChannel(`gyo-${roomId}`);
    localChannel.onmessage = ({ data }) => {
      if (!data || data.sender === clientId) return;
      if (!peerRef.current) {
        setStatus('Incoming signal detected. Building connection...');
        createPeer(false);
      }
      peerRef.current?.signal(data.data);
    };
    setChannelReady(true);
    setStatus('Local signaling ready. Open another tab with the same room ID.');
    localChannelRef.current = localChannel;

    return () => {
      localChannel.close();
      localChannelRef.current = null;
      setChannelReady(false);
    };
  }, [roomId, supabase, clientId]);

  const sendSignal = (data) => {
    if (signalingMode === 'supabase') {
      if (!channelRef.current) {
        setSignalingError('Signaling channel not ready.');
        return;
      }
      channelRef.current.send({ type: 'broadcast', event: 'signal', payload: { sender: clientId, data } });
      return;
    }

    if (!localChannelRef.current) {
      setSignalingError('Local signaling channel not ready.');
      return;
    }
    localChannelRef.current.postMessage({ sender: clientId, data });
  };

  const attachTracksToPeer = (stream) => {
    if (!peerRef.current || !stream) return;
    const senders = peerRef.current._pc?.getSenders?.() || [];
    stream.getTracks().forEach((track) => {
      // Newly requested media is enabled by the user action that captured it.
      // Do not read React state here because its setter may not have committed yet.
      track.enabled = true;
      const alreadyShared = senders.some((sender) => sender.track === track);
      if (!alreadyShared) {
        peerRef.current.addTrack(track, stream);
      }
    });
  };

  const createPeer = (initiator, outboundStream) => {
    const outbound = outboundStream || buildCompositeStream([screenStream, micStream, cameraStream]);
    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream: outbound || undefined,
    });

    peer.on('signal', (data) => sendSignal(data));
    peer.on('stream', (stream) => {
      setRemoteStream(stream);
      setConnectionState('connected');
      setStatus('Stream connected. Enjoy the show!');
    });
    peer.on('connect', () => setConnectionState('connected'));
    peer.on('close', () => {
      setConnectionState('closed');
      setStatus('Peer connection closed. You can reconnect if needed.');
    });
    peer.on('error', (err) => {
      setConnectionState('error');
      setStatus(`Connection error: ${err.message}`);
    });

    peerRef.current = peer;
  };

  const handleCreateRoom = () => {
    const id = generateRoomId();
    setIsHost(true);
    setRoomId(id);
    const link = `${window.location.origin}?room=${id}`;
    setRoomLink(link);
    window.history.replaceState({}, '', `?room=${id}`);
    setStatus('Room created. Share the link and start the broadcast when ready.');
  };

  const handleJoinRoom = () => {
    if (!roomId) return;
    setIsHost(false);
    const link = `${window.location.origin}?room=${roomId}`;
    setRoomLink(link);
    window.history.replaceState({}, '', `?room=${roomId}`);
    setStatus('Joined as viewer. Waiting for host to share the screen.');
  };

  const startBroadcast = async () => {
    if (!roomId) {
      setStatus('Create or join a room before broadcasting.');
      return;
    }
    if (!channelReady) {
      setStatus('Signaling warming up... wait a moment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false },
      });
      setScreenStream(stream);
      stream.getTracks().forEach((track) => {
        track.onended = () => setScreenStream(null);
      });
      if (!peerRef.current) {
        // React state updates asynchronously, so pass the captured stream into
        // the initial offer instead of waiting for screenStream to update.
        createPeer(true, buildCompositeStream([stream, micStream, cameraStream]));
      } else {
        attachTracksToPeer(stream);
      }
      setStatus('Broadcasting your screen.');
    } catch (err) {
      setStatus(`Screen share blocked: ${err.message}`);
    }
  };

  const ensureMediaStream = async (constraintKey, setter, enableSetter) => {
    try {
      const constraints = constraintKey === 'video' ? { video: true, audio: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setter(stream);
      enableSetter(true);
      attachTracksToPeer(stream);
    } catch (err) {
      setStatus(`Media access blocked: ${err.message}`);
    }
  };

  const toggleMic = async () => {
    if (!micStream) {
      await ensureMediaStream('audio', setMicStream, setMicEnabled);
      return;
    }
    const enabled = !micEnabled;
    micStream.getAudioTracks().forEach((track) => (track.enabled = enabled));
    setMicEnabled(enabled);
  };

  const toggleCamera = async () => {
    if (!cameraStream) {
      await ensureMediaStream('video', setCameraStream, setCameraEnabled);
      return;
    }
    const enabled = !cameraEnabled;
    cameraStream.getVideoTracks().forEach((track) => (track.enabled = enabled));
    setCameraEnabled(enabled);
  };

  const disconnect = () => {
    peerRef.current?.destroy();
    peerRef.current = null;
    setRemoteStream(null);
    setConnectionState('idle');
    setStatus('Disconnected. You can restart the broadcast or reconnect.');
  };

  const copyLink = async () => {
    if (!roomLink) return;
    await navigator.clipboard.writeText(roomLink);
    setStatus('Room link copied to clipboard.');
  };

  const supabaseMissing = !supabaseUrl || !supabaseKey;

  return (
    <div className="min-h-screen bg-surface text-white px-6 py-6 md:px-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-400">Gyo</p>
          <h1 className="text-3xl font-bold">Private P2P Theater</h1>
          <p className="text-gray-400 mt-1">Host a watch party with encrypted, peer-to-peer streaming.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <span className={`h-2 w-2 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
          <div className="flex flex-col">
            <span className="font-semibold">{connectionState === 'connected' ? 'Live' : 'Not streaming'}</span>
            <span className="text-xs text-gray-500">{status}</span>
          </div>
        </div>
      </header>

      {supabaseMissing && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-100">
          No Supabase keys detected. The app will still work for local testing in multiple tabs on this device. Add
          VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in a .env file to enable remote signaling.
        </div>
      )}

      <main className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="rounded-2xl bg-panel/80 p-4 glow-border flex flex-col gap-4">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black/60 border border-white/5 relative">
            {remoteStream ? (
              <video
                className="h-full w-full object-contain"
                autoPlay
                playsInline
                controls={false}
                ref={(node) => {
                  if (node && remoteStream) {
                    node.srcObject = remoteStream;
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500 text-center px-6">
                Waiting for the host to share their screen. Invite a friend and start the broadcast.
              </div>
            )}
            {screenStream && (
              <div className="absolute bottom-3 right-3 w-40 overflow-hidden rounded-lg border border-white/10 bg-black/60">
                <video
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                  ref={(node) => {
                    if (node && screenStream) {
                      node.srcObject = screenStream;
                    }
                  }}
                />
              </div>
            )}
            {cameraStream && (
              <div className="absolute bottom-3 left-3 w-32 overflow-hidden rounded-lg border border-white/10 bg-black/60">
                <video
                  className="h-full w-full object-cover video-mirror"
                  autoPlay
                  muted
                  playsInline
                  ref={(node) => {
                    if (node && cameraStream) node.srcObject = cameraStream;
                  }}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startBroadcast}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
              disabled={!isHost || !roomId}
            >
              Start Broadcast
            </button>
            <button
              onClick={toggleMic}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${micEnabled ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-300'}`}
            >
              {micEnabled ? 'Mute Mic' : 'Enable Mic'}
            </button>
            <button
              onClick={toggleCamera}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${cameraEnabled ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-300'}`}
            >
              {cameraEnabled ? 'Hide Camera' : 'Enable Camera'}
            </button>
            <button onClick={disconnect} className="text-sm text-gray-400 hover:text-white">
              Disconnect
            </button>
          </div>
        </section>

        <aside className="rounded-2xl bg-panel/80 p-4 glow-border flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Room Controls</h2>
            <span className="text-xs rounded-full border border-white/10 px-2 py-1 text-gray-300">
              {isHost ? 'Host mode' : 'Viewer mode'}
            </span>
          </div>
          <div className="grid gap-3">
            <div className="flex gap-2">
              <button
                onClick={handleCreateRoom}
                className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
              >
                Create Room
              </button>
              <button
                onClick={copyLink}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 hover:border-white/30"
              >
                Copy Link
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="gyo-123"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleJoinRoom}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-300"
                disabled={!roomId}
              >
                Join
              </button>
            </div>
            {roomLink && (
              <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-gray-200">
                <p className="text-xs uppercase tracking-wide text-gray-500">Invite link</p>
                <p className="break-all font-mono text-xs">{roomLink}</p>
              </div>
            )}
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-gray-200">
              <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
              <p className="mt-1 text-white">{status}</p>
              <p className="mt-1 text-xs text-gray-400">Signaling: {signalingMode === 'supabase' ? 'Supabase Realtime' : 'Local tab-to-tab fallback'}</p>
              {signalingError && <p className="mt-1 text-amber-400">{signalingError}</p>}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-gray-200">
              <p className="text-xs uppercase tracking-wide text-gray-500">How it works</p>
              <ul className="mt-2 space-y-1 text-gray-400 list-disc list-inside">
                <li>Create a room and share the invite link with a friend.</li>
                <li>Host clicks "Start Broadcast" and selects the Netflix tab with audio.</li>
                <li>Peer-to-peer WebRTC carries the video while Supabase only handles signaling.</li>
                <li>Use mic and camera toggles to chat during the show.</li>
              </ul>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
