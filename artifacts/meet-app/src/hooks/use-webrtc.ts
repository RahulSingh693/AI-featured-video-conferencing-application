import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket, type SignalData } from "@/lib/socket";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface UseWebRTCOptions {
  meetingId: number;
  myUserId: number;
  localStream: MediaStream | null;
  enabled: boolean;
}

export function useWebRTC({ meetingId, myUserId, localStream, enabled }: UseWebRTCOptions) {
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const peerConnections = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());

  const sendSignal = useCallback(
    (targetUserId: number, signal: SignalData) => {
      getSocket().emit("webrtc:signal", { meetingId, targetUserId, signal });
    },
    [meetingId],
  );

  const addRemoteStream = useCallback((userId: number, stream: MediaStream) => {
    setRemoteStreams((prev) => new Map(prev).set(userId, stream));
  }, []);

  const removeRemoteStream = useCallback((userId: number) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (remoteUserId: number): RTCPeerConnection => {
      const existing = peerConnections.current.get(remoteUserId);
      if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
        return existing;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Add local tracks to the connection
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // When ICE candidates are generated, send them to the remote peer
      pc.onicecandidate = (event) => {
        sendSignal(remoteUserId, {
          type: "ice-candidate",
          candidate: event.candidate ? event.candidate.toJSON() : null,
        });
      };

      // When remote tracks arrive, build a MediaStream and store it
      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        addRemoteStream(remoteUserId, remoteStream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          removeRemoteStream(remoteUserId);
          peerConnections.current.delete(remoteUserId);
        }
      };

      peerConnections.current.set(remoteUserId, pc);
      return pc;
    },
    [localStream, sendSignal, addRemoteStream, removeRemoteStream],
  );

  const closePeer = useCallback((userId: number) => {
    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }
    removeRemoteStream(userId);
    pendingCandidates.current.delete(userId);
  }, [removeRemoteStream]);

  // Initiate an offer to a remote peer (called by existing participants when a new peer joins)
  const initiateOffer = useCallback(
    async (remoteUserId: number) => {
      const pc = createPeerConnection(remoteUserId);
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        sendSignal(remoteUserId, { type: "offer", sdp: pc.localDescription! });
      } catch (err) {
        console.error("WebRTC: failed to create offer", err);
      }
    },
    [createPeerConnection, sendSignal],
  );

  // Handle incoming WebRTC signals
  const handleSignal = useCallback(
    async (fromUserId: number, signal: SignalData) => {
      if (signal.type === "offer") {
        const pc = createPeerConnection(fromUserId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Apply any pending ICE candidates that arrived before the offer
          const queued = pendingCandidates.current.get(fromUserId) ?? [];
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidates.current.delete(fromUserId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(fromUserId, { type: "answer", sdp: pc.localDescription! });
        } catch (err) {
          console.error("WebRTC: failed to handle offer", err);
        }
      } else if (signal.type === "answer") {
        const pc = peerConnections.current.get(fromUserId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Flush any queued candidates
          const queued = pendingCandidates.current.get(fromUserId) ?? [];
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidates.current.delete(fromUserId);
        } catch (err) {
          console.error("WebRTC: failed to handle answer", err);
        }
      } else if (signal.type === "ice-candidate") {
        const pc = peerConnections.current.get(fromUserId);
        if (!signal.candidate) return;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        } else {
          // Queue until remote description is set
          const queue = pendingCandidates.current.get(fromUserId) ?? [];
          queue.push(signal.candidate);
          pendingCandidates.current.set(fromUserId, queue);
        }
      }
    },
    [createPeerConnection, sendSignal],
  );

  useEffect(() => {
    if (!enabled || !myUserId) return;

    const socket = getSocket();

    const onNewPeer = ({ userId }: { userId: number; name: string }) => {
      if (userId === myUserId) return;
      // Existing participant: initiate offer to the newcomer
      initiateOffer(userId);
    };

    const onSignal = ({ fromUserId, signal }: { fromUserId: number; signal: SignalData }) => {
      handleSignal(fromUserId, signal);
    };

    const onParticipantLeft = ({ userId }: { userId: number }) => {
      closePeer(userId);
    };

    socket.on("webrtc:new-peer", onNewPeer);
    socket.on("webrtc:signal", onSignal);
    socket.on("participant:left", onParticipantLeft);

    return () => {
      socket.off("webrtc:new-peer", onNewPeer);
      socket.off("webrtc:signal", onSignal);
      socket.off("participant:left", onParticipantLeft);

      // Close all peer connections on unmount
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      pendingCandidates.current.clear();
    };
  }, [enabled, myUserId, initiateOffer, handleSignal, closePeer]);

  // When local stream changes (e.g. camera becomes available after initial connection),
  // add tracks to all existing peer connections
  useEffect(() => {
    if (!localStream) return;
    peerConnections.current.forEach((pc) => {
      const existingSenders = pc.getSenders();
      localStream.getTracks().forEach((track) => {
        const alreadySending = existingSenders.some((s) => s.track?.id === track.id);
        if (!alreadySending) {
          pc.addTrack(track, localStream);
        }
      });
    });
  }, [localStream]);

  return { remoteStreams, closePeer };
}
