import * as Peer from 'peerjs'
import {pack, unpack} from './Packer'
import Client from './Client'
import {BroadcastMessage, DirectMessage, VersionError} from './messages'

export default class Server extends Client {
    /** Map of all active connections. */
    public clients: Map<Peer.dcID, Peer.DataConnection> = new Map

    private doNotLog: boolean = false

    /**
     * Create a client as a server to other clients.
     */
    constructor(key: string, // a Peer JS API key.
                version: string, // version of top package, to make sure host and client are in sync.
                opts?: {
                    logger?: typeof Client.prototype.log, // optional method to log info.
                    options?: Peer.PeerJSOption, // Extra PeerJS options
                }) {
        super(key, version, '', opts)
    }

    /**
     * With all connections ready, we don't need to be in the server anymore.
     * Note: this is not the same as the 'ready' event.
     */
    ready() { this.peer.disconnect() }

    /**
     * Connect back to the server.
     */
    unready() { this.peer.reconnect() }

    /**
     * Send data to someone.
     */
    send(data: any, to?: Peer.DataConnection | Peer.dcID): boolean
    send(data: any, to: Peer.DataConnection | Peer.dcID, from?: Peer.DataConnection | Peer.dcID): boolean
    send(data: any,
         to: Peer.DataConnection | Peer.dcID,
         from?: Peer.DataConnection | Peer.dcID, // the client which actually sent the message
    ): boolean {
        function isDataConnection(something: any): something is Peer.DataConnection {
            return something && typeof (<Peer.DataConnection>something).send === 'function'
        }

        if (data instanceof Error)
            this.doNotLog = true

        if (typeof to === 'string')
            to = <Peer.DataConnection>this.clients.get(to)

        if (isDataConnection(to)) {
            let message = data

            // Send on behalf of
            if (typeof from === 'string')
                from = this.clients.get(from)

            if (isDataConnection(from))
                message = new DirectMessage(from.id, data)

            if (this.doNotLog)
                delete this.doNotLog
            else
                this.log('Sending', data, 'to', to.id, 'on behalf of', from ? from.id : 'no one')

            to.send(pack(message))
            return true
        } else
            this.errorHandler(Error('client is not an instance of DataConnection.'))

        return false
    }

    /**
     * Send to all connections.
     */
    broadcast(data: any, alsoReceive = true): void {
        if (this.clients.size === 0)
            return

        for (const client of this.clients.values()) {
            this.doNotLog = true
            this.send(data, client)
        }

        if (alsoReceive)
            this.receive(data)
        this.log(alsoReceive ? 'broadcasting' : 'forwarding', data)
    }

    protected errorHandler(e: Error) {
        // Do not remove all connections if a client with a bad version connects.
        if (e instanceof VersionError) {
            this.log(e.message)
            this.emit('error', e)
        } else
            super.errorHandler(e)
    }

    /**
     * Someone attempts to connect to us.
     */
    protected clientConnection(client: Peer.DataConnection) {
        if (client.metadata.version !== this.version) {
            client.once('open', () => {
                const e = new VersionError(`Version of client "${client.metadata.version}" doesn't match host "${this.version}".`)
                e.clientVersion = client.metadata.version
                e.hostVersion = this.version

                this.send(e, client)
                this.errorHandler(e)
                client.close()
            })
        } else
            this.bindDataConnection(client)
    }

    /**
     * A client has left the game.
     * @returns whether the client was actually removed.
     */
    protected clientDisconnection(client: Peer.DataConnection): boolean {
        this.log('closing with', client.id)

        if (this.clients.has(client.id)) {
            this.clients.delete(client.id)
            this.emit('clientDisconnection', client)
            this.emit('clientUpdate')
            client.close()
            return true
        }

        // give the client a chance to reconnect
        if (this.peer.disconnected) {
            this.unready()
            this.log('Connecting back to the server to allow the last client to reconnect.')
            setTimeout(() => this.ready(), 10000)
        }

        return false
    }

    /**
     * Parse a message to decide what to do.
     */
    protected receive(data: {to?: Peer.dcID, data: any}, client?: Peer.DataConnection): boolean {
        // Forward a message on behalf of someone
        if (data instanceof DirectMessage) {
            this.send(data.data, data.to, client)
            return false
        }

        // forward the broadcast to everyone else on client's behalf
        if (data instanceof BroadcastMessage) {
            // Send to all players except for one.
            for (const [id, connection] of this.clients) {
                if (client && id === client.id) continue
                this.send(data.data, connection, client)
            }
            this.receive(data.data, client)
            return false
        }

        // receive a regular message
        const from = client ? client.id : ''
        this.emit('data', {from, data})
        return true
    }

    /**
     * Binds all the correct listeners to THE Peer.
     */
    protected bindPeer() {
        super.bindPeer()
        this.peer.on('connection', (client: Peer.DataConnection) => this.onPeerConnection(client))
    }

    /**
     * Listener when the peer connects with the brokering server.
     */
    protected onPeerOnline(id: Peer.peerID) {
        this.emit('online')
        this.emit('ready', id)
    }

    /**
     * Listener when a client peer connects with our peer.
     */
    protected onPeerConnection(client: Peer.DataConnection) { this.clientConnection(client) }

    /**
     * Listener for a dataConnection's connection with the Host.
     */
    protected onDataConnectionOpen(client: Peer.DataConnection) {
        // Only add player to list when they are ready to listen.
        this.clients.set(client.id, client)
        this.emit('clientConnection', client)
        this.emit('clientUpdate')
    }

    /**
     * Listener for a dataConnection's disconnection with the Host.
     */
    protected onDataConnectionClose(client: Peer.DataConnection) { this.clientDisconnection(client) }

    /**
     * Listener for data through a dataConnection.
     */
    protected onDataConnectionData(client: Peer.DataConnection, data: any) { this.receive(unpack(data), client) }

}