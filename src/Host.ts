const Peer = require('peerjs')
import {pack, unpack} from './Packer'
import Client, {VersionError, DirectMessage, BroadcastMessage} from './Client'

/** @fires ready offline online quit clientConnection disconnection data */
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
	 * @event clientConnection
	 */
	protected clientConnection(client: PeerJs.DataConnection, version?: string) {
		if(client.metadata.version !== version) {
			client.on('open', () => {
				const e = <any>new VersionError(`Version of client "${client.metadata.version}" doesn't match host "${version}".`)
				e.clientVersion = client.metadata.version
				e.hostVersion = version

				this.sendTo(client, e)
				this.errorHandler(e)
			})
		} else {
			// Only add player to list when they are ready to listen.
			client.on('open', () => {
				this.clients.set(client.id, client)
				this.emit('clientConnection', client)
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
	 * @event disconnection
	 */
	protected disconnect(client?: PeerJs.DataConnection): boolean {
		this.log('closing with', client.id)

		if(this.clients.has(client.id)) {
			this.clients.delete(client.id)
			this.emit('disconnection', client)
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
			this.sendTo(data.to, data.data, client)
			return false
		}

		// forward the broadcast to everyone else on client's behalf
		if (data instanceof BroadcastMessage) {
			// Send to all players except for one.
			for(const [id, connection] of this.clients) {
				if (id === client.id) continue
				this.sendTo(connection, data.data, client)
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
	 * Alias for broadcast.
	 */
	send(data, to) {
		this.log('should not use method "send" as host.')
		this.broadcast(data)
	}

	/**
	 * Send data to someone.
	 *
	 * TODO combine this method with send method.
	 * TODO if sending to yourself, emit the receive
	 */
	sendTo(
		client: PeerJs.DataConnection | PeerJs.dcID,
		data: any,
		from?: PeerJs.DataConnection | PeerJs.dcID, // the client which actually sent the message
	): boolean {
		let message = data

		if(typeof from === 'string')
			from = this.clients.get(from)

		if(typeof client === 'string')
			client = this.clients.get(client)

		if(data instanceof Error)
			this.doNotLog = true

		if(from)
			message = new DirectMessage(from.id, data)

		if(typeof client.send === 'function') {
			if(this.doNotLog === undefined)
				this.log('Sending to', client.id, data)
			else
				delete this.doNotLog

			client.send(pack(message))
			return true
		} else
			this.errorHandler(Error('client is not an instance of DataConnection.'))

		return false
	}

	/**
	 * Send to all connections.
	 */
	broadcast(data: any): void {
		if(this.clients.size === 0)
			return

		for(const client of this.clients.values()) {
			this.doNotLog = true
			this.sendTo(client, data)
		}

		this.receive(data)
		this.log('Broadcasting', data)
	}
}
