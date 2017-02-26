import Peer from 'peerjs'
import Client from './Client'

/**
 * @fires error
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
	 */
	makePeer({
		version,
		options,
		hostID = Host.randomID(),
	}) {
		/**
		 * Hashmap of all active connection.
		 * @type {Object.<string, DataConnection>}
		 */
		this.peers = {}

		/**
		 * IDs of the connections
		 * @type {string[]}
		 */
		this.clientIDs = []

		/** @type {Peer} */
		this.peer = new Peer(hostID, options)
		this.peer.on('open', id => this.emit('ready', id))
		this.peer.on('connection', (c) => this.connection(c, version))
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('close', this.quit.bind(this))
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
			const e = Error(`Version of client "${client.metadata.version}" doesn't match host "${version}".`)
			e.name = 'version'
			this.errorHandler(e)
			client.on('open', () => {
				this.sendTo(client, e)
				client.close()
			})
			return
		}

		this.peers[client.id] = client
		this.clientIDs.push(client.id)

		client.on('open', () => this.emit('connection', client))
		client.on('data', data => this.receive(client, data))
		client.on('close', this.disconnect.bind(this, client))
		client.on('error', this.errorHandler.bind(this))
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
		const i = this.clientIDs.indexOf(client.id)

		if(i !== -1) {
			this.clientIDs.splice(i, 1) //delete this.clientIDs[i]
			delete this.peers[client.id]
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
		if(data.__to) {
			// forward the broadcast to everyone else on client's behalf
			if(data.__to === true) {
				data = data.data
				this.forward(client, data)
			} else { // send a direct message on behalf
				const other = this.peers[data.__to]
				if (other)
					this.sendTo(other, data.data, client)
				return false
			}
		}

		if(data.__error) {
			const error = Error(data.__error.message)
			if(data.__error.name)
				error.name = data.__error.name

			this.errorHandler(error)
		} else {
			// receive a regular message
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
	 * @param {DataConnection} client
	 * @param {*} data
	 * @param {DataConnection=} from the client which actually sent the message
	 */
	sendTo(client, data, from = null) {
		if(typeof from === 'string')
			from = this.peers[from]

		if(typeof client === 'string')
			client = this.peers[client]

		// Send errors properly
		if(data instanceof Error) {
			data = {
				__error: {
					message: data.message,
					name: data.name,
				}
			}
		}

		if(from)
			data = {
				data,
				__from: from.id,
			}

		// client instanceof DataConnection === false ?!?!?
		if(typeof client.send === 'function') {
			this.log('Sending to', client.id, data)
			client.send(data)
			return true
		}

		return false
	}

	/**
	 * Send to all connections.
	 *
	 * @param data
	 */
	broadcast(data) {
		if(this.clientIDs.length === 0)
			return

		const tmp = this.log
		this.log = () => {}

		for(let client of this.clients)
			this.sendTo(client, data)

		this.log = tmp
		this.log('Broadcasting', data)
	}

	/**
	 * Send to all players except for one.
	 * Useful for forwarding data from peer.
	 *
	 * @param {string|DataConnection} client the one to skip
	 * @param data
	 */
	forward(client, data) {
		if (typeof client === 'string') {
			client = this.peers[client]
		}

		const skip = this.clientIDs.indexOf(client.id)

		for(const index in this.clientIDs) {
			if (index == skip) continue

			this.sendTo(this.peers[this.clientIDs[index]], data, client)
		}

		this.log('Forwarding', data)
	}

	/**
	 * @returns {DataConnection[]} Array of all the connections.
	 */
	get clients() {
		return this.clientIDs.map(id => this.peers[id])
	}
}
