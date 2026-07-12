import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const url =
      import.meta.env.VITE_API_BASE_URL ||
      window.location.origin;

    const token = useAuthStore.getState().token;

    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: { token },
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      if (err.message === 'Invalid or expired token') {
        useAuthStore.getState().logout();
      }
    });
  }
  return socket;
};

export const reconnectSocket = () => {
  if (socket) {
    const token = useAuthStore.getState().token;
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const joinHackathon = (hackathonId: string) => {
  getSocket().emit('join:hackathon', hackathonId);
};

export const leaveHackathon = (hackathonId: string) => {
  getSocket().emit('leave:hackathon', hackathonId);
};
