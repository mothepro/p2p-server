import Peer from 'peerjs'
import Client from './Client'

/**
 * @fires ready
 * @fires offline
 * @fires online
 * @fires quit
 * @fires connection
 * @fires disconnection
 * @fires data
 */
export default class Host extends Client {
	/**
	 * Creates the Peer.
	 *
	 * @param {string} version version of top package, to make sure host and client are in sync.
	 * @param {string} hostID ID to use as the hosting peer.
	 * @param options for the Peer constructor.
	 * @override
	 * @event ready
	 * @event online
	 */
	makePeer({
		version,
		options,
		hostID = Host.randomID(),
	}) {
		/**
		 * Hashmap of all active connections.
		 * @type {Map<string, DataConnection>}
		 */
		this.clients = new Map

		/** @type {Peer} */
		this.peer = new Peer(hostID, options)
		this.peer.on('open', id => this.emit('ready', id))
		this.peer.on('connection', (c) => this.connection(c, version))
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.quit.bind(this))
		this.emit('online')
	}

	/**
	 * Generate a short random id
	 * @returns {string} length is always 7
	 */
	static randomID() {
		let ret = (new Date).getTime()
		ret += Math.random()
		ret *= 100
		ret = Math.floor(ret).toString(36) // base 36
		return ret.substr(3, 7) // remove repetition
	}

	/**
	 * Someone attempts to connect to us.
	 *
	 * @param {DataConnection} client
	 * @param {string=} version
	 * @protected
	 * @event connection
	 */
	connection(client, version = '0') {
		if(client.metadata.version !== version) {
			client.on('open', () => {
				const e = Error(`Version of client "${client.metadata.version}" doesn't match host "${version}".`)
				e.name = 'version'

				this.sendTo(client, e)
				this.errorHandler(e)
			})
		} else {
			// Only add player to list when they are ready to listen.
			client.on('open', () => {
				this.clients.set(client.id, client)
				this.emit('connection', client)
			})
			client.on('data', data => this.receive(client, data))
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
	 *
	 * @param {DataConnection} client
	 * @returns {boolean} whether the client was actually removed.
	 * @protected
	 * @event disconnection
	 */
	disconnect(client) {
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
	 *
	 * @param {DataConnection} client
	 * @param data
	 * @protected
	 * @event data
	 */
	receive(client, data) {
		if('__to' in data) {
			// forward the broadcast to everyone else on client's behalf
			if(data.__to === true) {
				data = data.data

				// Send to all players except for one.
				for(const [id, connection] of this.clients) {
					if (id === client.id) continue
					this.sendTo(connection, data, client)
				}
			} else { // send a direct message on behalf
				this.sendTo(data.__to, data.data, client)
				return false
			}
		}

		// receive a regular message
		if(!this.decode(data)) {
			this.emit('data', {
				from: client,
				data,
			})
		}
	}

	/**
	 * Alias for broadcast.
	 * @override
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
	 * @param {DataConnection|string} client
	 * @param {*} data
	 * @param {DataConnection|string=} from the client which actually sent the message
	 */
	sendTo(client, data, from = null) {
		if(typeof from === 'string')
			from = this.clients.get(from)

		if(typeof client === 'string')
			client = this.clients.get(client)

		if(data instanceof Error)
			this.doNotLog = true
		data = this.constructor.encode(data)

		if(from)
			data = {
				data,
				__from: from.id,
			}

		if(typeof client.send === 'function') {
			if(this.doNotLog === undefined)
				this.log('Sending to', client.id, data)
			else
				delete this.doNotLog

			client.send(data)
			return true
		} else
			this.errorHandler(Error('client is not an instance of DataConnection.'))

		return false
	}

	/**
	 * Send to all connections.
	 *
	 * @param data
	 */
	broadcast(data) {
		if(this.clients.size === 0)
			return

		for(const client of this.clients.values()) {
			this.doNotLog = true
			this.sendTo(client, data)
		}

		this.log('Broadcasting', data)
	}
}
