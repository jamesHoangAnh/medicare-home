/**
 * Hệ thống con RealtimeCommunication
 * WebRTC Signaling Server sử dụng Socket.IO
 * Cơ chế: Distribution & Communication (theo báo cáo 4.2.2)
 */
const { Server } = require("socket.io");
const { logAction } = require("../../middleware/logger");

let io;

/**
 * Khởi tạo Socket.IO server
 */
function initSignalingServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 [WebRTC] Client kết nối: ${socket.id}`);

    // User join room với ID của họ
    socket.on("join", (userId) => {
      socket.join(`user-${userId}`);
      console.log(`👤 User ${userId} joined room user-${userId}`);
    });

    // Yêu cầu cuộc gọi Video
    socket.on("call-request", async (data) => {
      const { fromUserId, toUserId, fromUserName, callType } = data;

      console.log(
        `📞 Call request: ${fromUserId} -> ${toUserId} (${callType})`,
      );

      // Gửi lời mời đến người nhận
      io.to(`user-${toUserId}`).emit("incoming-call", {
        fromUserId,
        fromUserName,
        callType,
        roomId: `room-${Date.now()}`,
      });

      // Ghi log
      await logAction({
        idUser: fromUserId,
        hanhDong: "Yêu cầu cuộc gọi",
        doiTuong: "VideoCall",
        chiTiet: `${callType} từ ${fromUserId} đến ${toUserId}`,
      });
    });

    // Chấp nhận cuộc gọi
    socket.on("call-accepted", (data) => {
      const { roomId, fromUserId, toUserId } = data;

      io.to(`user-${fromUserId}`).emit("call-accepted", {
        roomId,
        toUserId,
      });

      console.log(`✅ Call accepted: ${roomId}`);
    });

    // Từ chối cuộc gọi
    socket.on("call-rejected", (data) => {
      const { fromUserId, reason } = data;
      io.to(`user-${fromUserId}`).emit("call-rejected", { reason });
    });

    // Kết thúc cuộc gọi
    socket.on("call-ended", async (data) => {
      const { roomId, duration, userId } = data;

      io.to(`user-${userId}`).emit("call-ended", { roomId });

      await logAction({
        idUser: userId,
        hanhDong: "Kết thúc cuộc gọi",
        doiTuong: "VideoCall",
        chiTiet: `Room: ${roomId}, Duration: ${duration}s`,
      });
    });

    // WebRTC signaling messages
    socket.on("offer", (data) => {
      io.to(`user-${data.targetUserId}`).emit("offer", {
        sdp: data.sdp,
        fromUserId: socket.userId,
      });
    });

    socket.on("answer", (data) => {
      io.to(`user-${data.targetUserId}`).emit("answer", {
        sdp: data.sdp,
        fromUserId: socket.userId,
      });
    });

    socket.on("ice-candidate", (data) => {
      io.to(`user-${data.targetUserId}`).emit("ice-candidate", {
        candidate: data.candidate,
        fromUserId: socket.userId,
      });
    });

    // Chat messages
    socket.on("chat-message", (data) => {
      io.to(`user-${data.toUserId}`).emit("chat-message", {
        fromUserId: socket.userId,
        message: data.message,
        timestamp: new Date(),
      });
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`🔌 [WebRTC] Client ngắt kết nối: ${socket.id}`);
    });
  });

  console.log("✅ [WebRTC] Signaling server đã khởi tạo");
  return io;
}

function getIO() {
  return io;
}

module.exports = {
  initSignalingServer,
  getIO,
};
