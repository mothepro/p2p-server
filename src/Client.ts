import EventEmitter from 'typed-event-emitter-2'
import * as Peer from 'peerjs'
import {pack, unpack} from './Packer'
import {BroadcastMessage, DirectMessage, VersionError} from './messages'

export default class Client extends EventEmitter<
    'connection' | 'disconnection' | // Emitted by Client on {,dis}connection with Host.
    'online' | 'offline' | // Emitted on {,dis}connection with brokering server.
    'start' | 'quit' | // Emitted when starting / closing Peer connection.
    'clientUpdate', // Emitted by Server when a client {,dis}connects.
    {
        error: Error, // Emitted on error.
        data: { // Emitted when data is received.
            from: Peer.dcID | '' // | Peer.DataConnection, // For now, let's only emit the connection ID
            data: any,
        },
        ready: Peer.peerID, // Emitted when the Server is ready to accept Clients.
        clientConnection: Peer.DataConnection, // Emitted by Server when a client connects.
        clientDisconnection: Peer.DataConnection, // Emitted by Server when a client disconnects.
    }> {

    public peer: Peer
    public host: Peer.DataConnection

    private stopping: boolean = false

    /**
     * Create a client that will immediately connectToHost to a Host.
     */
    constructor(protected key: string, // a Peer JS API key.
                protected version: string, // version of top package, to make sure host and client are in sync.
                protected hostID: Peer.peerID, // peer id of host to connectToHost to.
                {logger, options = {secure: false}}: {
                    logger?: typeof Client.prototype.log, // optional method to log info.
                    options?: Peer.PeerJSOption, // Extra PeerJS options
                } = {}) {
        super()

        this.bindMe()

        if (logger) {
            this.log = logger
            options = {
                ...options,
                debug: 3,
                logFunction: this.log.bind(this, 'peerjs'),
            }
        }
        options.key = key

        this.peer = new Peer(Client.randomID(), options)
        this.bindPeer()
        this.emit('start')
    }

    /**
     * Generate a short random id, length is always 7.
     */
    private static randomID(): Peer.peerID {
        let num = (new Date).getTime()
        num += Math.random()
        num *= 100
        const ret = <string>Math.floor(num).toString(36) // base 36
        return ret.substr(3, 7) // remove repetition
    }

    /**
     * Logs info, empty by default.
     */
    log(...args: any[]): void {}

    /**
     * Send data to the host.
     * Sends a Message or DirectMessage
     * @param data
     * @param to Connection to send to, leave empty for host
     */
    send(data: any, to?: Peer.dcID): void {
        let message = data

        if (to)
            message = new DirectMessage(to, data)

        this.host.send(pack(message))
        this.log('sending', data)
    }

    /**
     * Tell the host to broadcast this message.
     * Then, receive it for myself.
     * Sends a BroadcastMessage
     */
    broadcast(data: any, alsoReceive = true): void {
        this.host.send(pack(new BroadcastMessage(data)))
        // TODO Where should the data be "from" if I broadcasted it???
        if (alsoReceive)
            this.receive(data)
        this.log(alsoReceive ? 'broadcasting' : 'forwarding', data)
    }

    /**
     * Peer is destroyed and can no longer accept or create any new connections.
     * At this time, the peer's connections will all be closed.
     */
    quit(): void {
        if (!this.peer.destroyed && !this.stopping) {
            this.stopping = true
            this.peer.destroy()
            this.emit('quit')
        }
    }

    /**
     * Receive some data from the host. (Message or DirectMessage)
     */
    protected receive(data: Error | DirectMessage | any): void {
        if (data instanceof Error)
            this.errorHandler(data)
        else if (data instanceof DirectMessage)
            this.emit('data', {
                from: data.to,
                data: data.data,
            })
        else
            this.emit('data', {
                from: this.host.id,
                data,
            })
    }

    /**
     * Handle errors with the peer.
     */
    protected errorHandler(e: Error): void {
        // Handle errors with the connection to the host.
        if ((<any>e).type === 'peer-unavailable') {
            this.log('Unable to connect to the host. Make a new instance, or reload')
            this.quit()
        } else if (e instanceof VersionError) {
            this.log(e.message)
            this.host.removeAllListeners()
            this.emit('disconnection') // because we emitted 'connection'
            this.quit()
        }

        this.emit('error', e)
    }

    /**
     * Connect to the host. Then disconnect from the server.
     */
    private connectToHost() {
        this.host = this.peer.connect(this.hostID, {metadata: {version: this.version}})
        this.bindDataConnection(this.host)
    }

    /**
     * Disconnected from the host.
     * Can try to reconnect to the server, then to the host again.
     */
    private retryConnectHost(): void {
        // go back online
        this.peer.reconnect()

        // can't connect to server? Give up.
        if (this.peer.disconnected)
            this.quit()
    }

    /**
     * Binds all the correct listeners to THE Peer.
     */
    protected bindPeer() {
        this.peer.on('open', () => this.emit('online'))
        this.peer.on('disconnected', () => this.emit('offline'))
        this.peer.on('close', () => this.quit())
        this.peer.on('error', (err: Error) => this.errorHandler(err))
    }

    /**
     * Binds all the correct listeners to a DataConnection.
     */
    protected bindDataConnection(dataConnection: Peer.DataConnection) {
        dataConnection.on('error', (err: Error) => this.errorHandler(err))
        dataConnection.on('close', () => this.emit('disconnection'))
        dataConnection.on('open', () => this.emit('connection'))
        dataConnection.on('data', (data: any) => this.receive(unpack(data)))
    }

    protected bindMe() {
        this.on('online', () => this.connectToHost())
        this.on('connection', () => this.peer.disconnect())
        this.on('disconnection', () => this.retryConnectHost())
    }
}
