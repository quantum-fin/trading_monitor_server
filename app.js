const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const port = 8080;
const index = require('./routes')
const app = express();
app.use(index);

const server = http.createServer(app);
const io = socketIO(server);

// reqId, ticker, |-sep ip addresses
let INPUT_FILENAME = "./input.csv";

// reqId, ticker, price, status
let OUTPUT_FILENAME = "./output.csv";

let INVALIDATED = 0;
let TIMER_MS = 3000;

let request_id = 0;  // our request ID
let clients = new Map();  // our request ID to client socket/uuid/ip/requestID/price/etc

// todo
let previous_closes = new Map([
    ['TSLA', 752.92],
    ['AAPL', 156.69],
    ['FB', 382.18],
    ['JPM', 159.21],
    ['XOM', 54.55],
    ['FDS', 382.41]
]);

let input_file = fs.createWriteStream(INPUT_FILENAME, { flags: "a" });

io.on("connection", (socket) => {
    socket.on("handshake", (auth) => {
        let client_id = auth.id;
        let ip_addr = auth.ip_addr.join('|');
        console.log(`new client ${client_id}, ${ip_addr} connected`);

        socket.on("requestPrice", (data) => {
            let prev_close;

            if (previous_closes.has(data.ticker)) {
                prev_close = previous_closes.get(data.ticker);
            } else {
                prev_close = NaN;
            }

            clients.set(request_id, {
                socket: socket,
                client_id: client_id,
                ip_addr: ip_addr,
                request_id: data.id,
                ticker: data.ticker,
                price: NaN,
                prev_close: prev_close
            });

            console.log(`requestPrice: ${client_id}: clientReqId=${data.id}, ourReqId=${request_id}, ticker=${data.ticker}`);
            input_file.write(`${request_id},${data.ticker},${ip_addr}\n`);
            request_id += 1;
        });

        socket.on("invalidateRequest", (data) => {
            clients.forEach((value, key) => {
                if ((value.client_id === client_id) && (value.ip_addr === ip_addr) && (value.request_id === data.id)) {
                    console.log(`invalidateRequest: ${client_id}: clientReqId=${data.id}, ourReqId=${value.request_id}, ticker=${value.ticker}`);
                    clients.delete(key);
                }
            });
        });

        socket.on("disconnect", () => {
            console.log(`client ${client_id}, ${ip_addr} disconnected`);

            clients.forEach((value, key) => {
                if ((value.client_id === client_id) && (value.ip_addr === ip_addr)) {
                    clients.delete(key);
                }
            });
        });
    });
});

const handle_output = (line) => {
    let [id, ticker, price, status] = line.split(',');

    id = parseInt(id);
    status = parseInt(status);

    if (status === INVALIDATED) {
        console.log(`reqId ${id} is invalidated, stop sending data`);

        if (clients.has(id)) {
            let data = clients.get(id);
            data.socket.emit("requestInvalidated", {id: data.request_id});
            clients.delete(id);
        }
    }

    else if (clients.has(id)) {
        price = parseFloat(price);
        let data = clients.get(id);
        data.price = price;
    }
};

const broadcastData = () => {
    clients.forEach((data) => {
        let message = {
            id: data.request_id,
            ticker: data.ticker,
            currency: "USD",
            price: data.price,
            prev_close: data.prev_close
        };

        data.socket.emit("price", message);
        console.log(`sent price data to ${data.client_id}`);
    });
};

const tail = require('tail');
const reader = new tail.Tail(OUTPUT_FILENAME);
reader.on("line", handle_output);
setInterval(broadcastData, TIMER_MS);
server.listen(port, () => console.log(`Listening on port ${port}`));
