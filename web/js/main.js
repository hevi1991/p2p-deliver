"use strict";

// DOM
const createButton = document.querySelector("#create-btn");
const roomIdInput = document.querySelector("#room-id");
const joinButton = document.querySelector("#join-btn");
const connectionJoinArea = document.querySelector(".connection-join-area");
const connectionInfoArea = document.querySelector(".connection-info-area");
const leaveButton = document.querySelector("#leave-btn");
const displayroomIdInput = document.querySelector("#display-room-id");
const userlistUl = document.querySelector("#userlist");
const fileArea = document.querySelector(".file-area");
const sendButton = document.querySelector("#send-btn");
const filelistUl = document.querySelector("#filelist");
const fileInput = document.querySelector("#file");

// Connection
let peerConnection, socket, fileConfirmDataChannel, fileDataChannel;

// client info
const STATE = {
  JOINED: "JOINED",
  JOINED_CONN: "JOINED_CONN",
  JOINED_UNBIND: "JOINED_UNBIND",
  LEFT: "LEFT"
};

let client = new Proxy({roomId: "", state: ""}, {
  get: function (target, propKey, receiver) {
    return Reflect.get(target, propKey, receiver);
  },
  set: function (target, propKey, value, receiver) {
    console.log(`Client: ${propKey} - ${value}`);
    return Reflect.set(target, propKey, value, receiver);
  }
});

// file data channel using variable
let receiveBuffer = [];
let receiveSize, file;

// DOM display action
function showRoomInfo(roomId, userList) {
  displayroomIdInput.value = roomId;
  connectionJoinArea.classList.add("hidden");
  connectionInfoArea.classList.remove("hidden");
  userlistUl.innerHTML = "";
  userList.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user;
    if (user === socket.id) {
      li.style.color = "blue";
    }
    userlistUl.appendChild(li);
  });
  leaveButton.disabled = false;

  fileArea.classList.remove("hidden");
}

function showRoomJoin() {
  connectionInfoArea.classList.add("hidden");
  connectionJoinArea.classList.remove("hidden");
  roomIdInput.value = "";
  joinButton.disabled = false;
  createButton.disabled = false;

  fileArea.classList.add("hidden");
}

// PeerConnection
function createPeerConnection() {
  if (!peerConnection) {
    const pcConfig = {
      "iceServers": [{
        /*
        * ice server
        * urls ice server address
        * username
        * credential
        * */
        "urls": `stun:${location.hostname}:3478`,
        "username": "bbb",
        "credential": "1234"
      }],

    };
    peerConnection = new RTCPeerConnection();
    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        sendMessage(displayroomIdInput.value, {
          type: "candidate",
          candidate: e.candidate
        });
      }
    };


    // Local dataChannel setup
    // make sure setup a current ice server
    function receiveFileConfirmDataChannelMessage(e) {
      let data = JSON.parse(e.data);
      switch (data.type) {
        case "ask":
          const answer = confirm(`Sender: ${data.sender} \nFile: ${data.file.name}\nSize: ${bytesToSize(data.file.size)}\nDo you accept?`);
          fileConfirmDataChannel.send(JSON.stringify({type: "answer", answer}));
          // todo: put file li into filelist, and show process
          file = data.file;
          receiveSize = 0;
          break;
        case "answer":
          if (data.answer) {
            console.log(`data.answer: ${data.answer}`);
            // todo send file using filedatachannel
            const fileReader = new FileReader();
            fileReader.onloadend = e => {
              // fixme file type error and size problem
              const arrayBuffer = e.target.result;
              for (let start = 0; start < arrayBuffer.byteLength; start += peerConnection.sctp.maxMessageSize) {
                const end = start + peerConnection.sctp.maxMessageSize > arrayBuffer.byteLength ? arrayBuffer.byteLength : start + peerConnection.sctp.maxMessageSize;
                fileDataChannel.send(arrayBuffer.slice(start, end));
              }
            };
            fileReader.readAsArrayBuffer(fileInput.files[0]);
          }
      }
    }

    fileConfirmDataChannel = peerConnection.createDataChannel("file-confirm");
    fileConfirmDataChannel.onmessage = receiveFileConfirmDataChannelMessage;
    const fileConfirmDataChannelStateChange = () => {
      console.log(`fileConfirmDataChannel.readyState: ${fileConfirmDataChannel.readyState}`);
      switch (fileConfirmDataChannel.readyState) {
        case "open":
          sendButton.disabled = false;
          break;
        case "closed":
          sendButton.disabled = true;
          break;
      }
    };
    fileConfirmDataChannel.onopen = fileConfirmDataChannelStateChange;
    fileConfirmDataChannel.onclose = fileConfirmDataChannelStateChange;

    // deliver file
    function receiveFileDataChannelMessage(e) {
      receiveBuffer.push(e.data);
      receiveSize += e.data.byteLength;
      // todo: process
      if (receiveSize === file.size) {
        let resultFile = new Blob(receiveBuffer);
        const url = URL.createObjectURL(resultFile);
        const a = document.createElement("a");
        a.download = file.name;
        a.href = url;
        a.textContent = file.name;
        const li = document.createElement("li");
        li.appendChild(a);
        filelistUl.appendChild(li);
        receiveBuffer = [];
        receiveSize = 0;
      }
    }

    fileDataChannel = peerConnection.createDataChannel("file", {ordered: true, negotiated: true, id: 0});
    fileDataChannel.onmessage = receiveFileDataChannelMessage;
    const fileDataChannelStateChange = () => {
      console.log(`fileDataChannel.readyState: ${fileDataChannel.readyState}`);
    };
    fileDataChannel.onopen = fileDataChannelStateChange;
    fileDataChannel.onclose = fileDataChannelStateChange;

    // Remote dataChannel setup
    peerConnection.ondatachannel = (e) => {
      switch (e.channel.label) {
        case "file-confirm":
          e.channel.onmessage = receiveFileConfirmDataChannelMessage;
          e.channel.onopen = fileConfirmDataChannelStateChange;
          e.channel.onclose = fileConfirmDataChannelStateChange;
          break;
        case "file":
          e.channel.onmessage = receiveFileDataChannelMessage;
          e.channel.onopen = fileDataChannelStateChange;
          e.channel.onclose = fileDataChannelStateChange;
          break;
      }
    };
  }
}

function closePeerConnection() {
  if (peerConnection) {
    if (fileConfirmDataChannel) {
      fileConfirmDataChannel.close();
    }
    if (fileDataChannel) {
      fileDataChannel.close();
    }
    peerConnection.close();
    peerConnection = null;
  }
}

function call() {
  if (client.state === STATE.JOINED_CONN && peerConnection) {
    // PeerConnection can not fire onicecandidate event if create offer not contains receive media.
    peerConnection.createOffer({
      offerToReceiveAudio: true,
    }).then(desc => {
      peerConnection.setLocalDescription(desc).catch(console.error);
      sendMessage(displayroomIdInput.value, desc);
    });
  }
}

function sendMessage(roomId, data) {
  if (socket) {
    socket.emit("message", roomId, data);
  }
}

// configure socket
function configureSocket(socket) {
  socket.on("joined", (roomId, userList) => {
    client.room = roomId;
    client.state = STATE.JOINED;
    filelistUl.innerHTML = "";
    showRoomInfo(roomId, userList);
    createButton.disabled = false;
    // create peer connection
    createPeerConnection();
    if (userList.indexOf(socket.id) !== -1 && userList.length > 1) {
      client.state = STATE.JOINED_CONN;
    }
  });

  socket.on("otherjoined", (roomId, userList) => {
    showRoomInfo(roomId, userList);
    client.state = STATE.JOINED_CONN;
    // create peerconnection if not existed.
    createPeerConnection();
    // create offer
    call();
  });

  socket.on("bye", (roomId, userList) => {
    showRoomInfo(roomId, userList);
    client.state = STATE.JOINED_UNBIND;
    closePeerConnection();
  });

  socket.on("full", roomId => {
    alert(`Room(${roomId}) is full.`);
    closePeerConnection();
    showRoomJoin();
    client.state = STATE.LEFT;
  });

  socket.on("refuse", reason => {
    console.log(reason);
    closePeerConnection();
    showRoomJoin();
    client.state = STATE.LEFT;
  });

  socket.on("leave", roomId => {
    closePeerConnection();
    showRoomJoin();
    fileInput.value = "";
    client.state = STATE.LEFT;
  });

  socket.on("message", (roomId, data) => {
    console.log(`Receive message: ${data.type}`);
    if (data) {
      if (data.type === "offer") {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        peerConnection.createAnswer()
          .then(desc => {
            peerConnection.setLocalDescription(desc);
            sendMessage(roomId, desc);
          })
          .catch(console.error);
      } else if (data.type === "answer") {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === "candidate") {
        // console.log(data.candidate);
        peerConnection.addIceCandidate(data.candidate);
      } else {
        console.error(`Invalid data type.`);
      }
    }
  });
}


// DOM Event
createButton.onclick = (e) => {
  createButton.disabled = true;
  joinButton.disabled = true;
  socket = io();
  configureSocket(socket);
  socket.emit("new");
};
joinButton.onclick = (e) => {
  if (roomIdInput.value === "") return;
  createButton.disabled = true;
  joinButton.disabled = true;
  socket = io();
  configureSocket(socket);
  socket.emit("join", roomIdInput.value);
};
leaveButton.onclick = (e) => {
  if (socket) {
    socket.emit("leave", displayroomIdInput.value);
  }
};
sendButton.onclick = (e) => {
  if (fileInput.files.length === 0) return;
  const aFile = fileInput.files[0];

  fileConfirmDataChannel.send(JSON.stringify({
    type: "ask",
    sender: socket.id,
    file: {
      name: aFile.name,
      size: aFile.size,
    }
  }));
};
window.onunload = (e) => {
  if (socket) {
    socket.emit("leave", displayroomIdInput.value);
    socket.disconnect();
    closePeerConnection();
  }
};

// utils
function bytesToSize(bytes) {
  if (bytes === 0) return "0 B";
  let k = 1024,
    sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}
