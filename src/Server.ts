import * as Peer from 'peerjs'
import {pack, unpack} from './Packer'
import Client from './Client'
import {BroadcastMessage, DirectMessage, VersionError} from './messages'

export default class Server extends Client {
    // Map of all active connections.
    public clients: Map<Peer.dcID, Peer.DataConnection> = new Map

    private doNotLog: boolean = false

    protected onPeerOpen(version: string, hostID: Peer.peerID) {
        return (id: Peer.peerID) => this.emit('ready', id)
    }
    protected onPeerDisconnect() {
        super.onPeerDisconnect()
        return this.emit('offline')
    }
    protected onPeerConnect(version: string) {
        return (client: Peer.DataConnection) => this.clientConnection(client, version)
    }

    constructor({key, version, logger, options}: {
        key: string, // a Peer JS API key.
        version: string, // version of top package, to make sure host and client are in sync.
        logger?: typeof Client.prototype.log, // optional method to log info.
        options?: Peer.PeerJSOption, // Extra PeerJS options
    }) {
        super({key, version, hostID: '', logger, options})
        this.peer.on('connection', this.onPeerConnect(version))
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
     * With all connections ready, we don't need to be in the server anymore.
     * Note: this is not the same as the 'ready' event.
     */
    ready() { this.peer.disconnect() }

    /**
     * Connect back to the server.
     */
    unready() { this.peer.reconnect() }

    /**
     * Someone attempts to connect to us.
     */
    protected clientConnection(client: Peer.DataConnection, version: string) {
        if (client.metadata.version !== version) {
            client.on('open', () => {
                const e = new VersionError(`Version of client "${client.metadata.version}" doesn't match host "${version}".`)
                e.clientVersion = client.metadata.version
                e.hostVersion = version

                this.send(e, client)
                this.errorHandler(e)
            })
        } else {
            // Only add player to list when they are ready to listen.
            client.on('open', () => {
                this.clients.set(client.id, client)
                this.emit('clientConnection', client)
                this.emit('clientUpdate')
            })
            client.on('data', data => this.receive(unpack(data), client))
            client.on('close', this.clientDisconnection.bind(this, client))
            client.on('error', this.errorHandler.bind(this))
        }
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
    protected receive(data: { to: Peer.dcID, data: any }, client?: Peer.DataConnection): boolean {
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
}