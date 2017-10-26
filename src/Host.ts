import {pack, unpack} from './Packer'
import Client, {VersionError, DirectMessage, BroadcastMessage} from './Client'
let Peer
if(process.env.NODE_ENV === 'test') {
    Peer = require('../test/stubs/MockPeer')
} else {
    Peer = require('peerjs')
}

/** @fires ready offline online quit clientConnection clientDisconnection clientUpdate data */
export default class Host extends Client {
	// Hashmap of all active connections.
	public clients: Map<PeerJs.dcID, PeerJs.DataConnection> = new Map

	private doNotLog: boolean = false

	makePeer({
		version,
		options,
		hostID = Host.randomID(),
	}) {
		this.peer = new Peer(hostID, options)
		this.peer.on('open', id => this.emit('ready', id))
		this.peer.on('connection', c => this.clientConnection(c, version))
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.quit.bind(this))
		this.emit('online')
	}

    /**
     * Do not remove all connections if a client with a bad version connects.
     * @event error
     */
    protected errorHandler(e: Error) {
        // Handle errors with the clientConnection to the host.
        if (e instanceof VersionError) {
            this.log(e.message)
			this.emit('error', e)
        } else
        	super.errorHandler(e)
    }

	/**
	 * Generate a short random id, length is always 7.
	 */
	static randomID(): PeerJs.peerID {
		let num = (new Date).getTime()
		num += Math.random()
		num *= 100
		const ret = <string>Math.floor(num).toString(36) // base 36
		return ret.substr(3, 7) // remove repetition
	}

	/**
	 * Someone attempts to connect to us.
	 * @event clientConnection clientUpdate
	 */
	protected clientConnection(client: PeerJs.DataConnection, version?: string) {
		if(client.metadata.version !== version) {
			client.on('open', () => {
				const e = <any>new VersionError(`Version of client "${client.metadata.version}" doesn't match host "${version}".`)
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
			client.on('close', this.disconnect.bind(this, client))
			client.on('error', this.errorHandler.bind(this))
		}
	}

	/**
	 * With all connections ready, we don't need to be in the server anymore.
	 * @event offline
	 */
	ready() {
		this.peer.disconnect()
		this.emit('offline')
	}

	/**
	 * Connect back to the server.
	 * @event online
	 */
	unready() {
		this.peer.reconnect()
		this.emit('online')
	}

	/**
	 * A client has left the game.
	 * @returns whether the client was actually removed.
	 * @event clientDisconnection clientUpdate
	 */
	protected disconnect(client?: PeerJs.DataConnection): boolean {
		this.log('closing with', client.id)

		if(this.clients.has(client.id)) {
			this.clients.delete(client.id)
			this.emit('clientDisconnection', client)
            this.emit('clientUpdate')
			client.close()
			return true
		}

		// give the client a chance to reconnect
		if(this.peer.disconnected) {
			this.unready()
			setTimeout(() => this.ready(), 10000)
		}

		return false
	}

	/**
	 * Parse a message to decide what to do.
	 * @event data
	 */
	protected receive(data: {to: PeerJs.dcID, data: any}, client?: PeerJs.DataConnection): boolean {
		// Forward a message on behalf of someone
		if (data instanceof DirectMessage) {
			this.send(data.data, data.to, client)
			return false
		}

		// forward the broadcast to everyone else on client's behalf
		if (data instanceof BroadcastMessage) {
			// Send to all players except for one.
			for(const [id, connection] of this.clients) {
				if (id === client.id) continue
				this.send(data.data, connection, client)
			}
			this.emit('data', {
				from: client,
				data: data.data,
			})
			return
		}

		// receive a regular message
		this.emit('data', {
			from: client,
			data,
		})
		return true
	}

	/**
	 * Send data to someone.
	 *
	 * TODO if sending to yourself, emit the receive
	 */
	send(
		data: any,
		to: PeerJs.DataConnection | PeerJs.dcID,
		from?: PeerJs.DataConnection | PeerJs.dcID, // the client which actually sent the message
	): boolean {
		let message = data

		if(typeof from === 'string')
			from = this.clients.get(from)

		if(typeof to === 'string')
			to = this.clients.get(to)

		if(data instanceof Error)
			this.doNotLog = true

		if(from)
			message = new DirectMessage(from.id, data)

		if(typeof to.send === 'function') {
			if(this.doNotLog === undefined)
				this.log('Sending to', to.id, data)
			else
				delete this.doNotLog

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
		if(this.clients.size === 0)
			return

		for(const client of this.clients.values()) {
			this.doNotLog = true
			this.send(data, client)
		}

		if(alsoReceive)
			this.receive(data)
        this.log(alsoReceive ? 'broadcasting' : 'forwarding', data)
	}
}
