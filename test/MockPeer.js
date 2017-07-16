import EventEmitter from 'events'


global.window = {
	RTCIceCandidate: {},
	RTCSessionDescription: {},
	RTCPeerConnection: {},
}

/** @type {Map<string, MockPeer} */
const allPeers = new Map

export default class MockPeer extends EventEmitter {
	/**
	 * @param {string} id
	 * @param options
	 */
	constructor(id = MockPeer.randomID(), options) {
		super()

		if(typeof id === 'object') {
			options = id
			id = MockPeer.randomID()
		}

		this.id = id
		this.destroyed = false
		this.disconnected = false

		this.connectionMap = new Map

		allPeers.set(this.id, this)
		setTimeout(() => this.emit('open', id), 0)
	}

	connect(id, options = null) {
		const otherPeer =  allPeers.get(id)

		const myData = new MockDataConnection(this, options)
		const theirData = new MockDataConnection(otherPeer, options)

		myData.client = theirData
		theirData.client = myData

		this.connectionMap.set(id, theirData)
		otherPeer.connectionMap.set(this.id, myData)

		otherPeer.emit('connection', theirData)
		return myData
	}

	disconnect() {
		this.disconnected = true
		this.emit('disconnected')
	}

	reconnect() {
		if(!this.disconnected) {
			const err = Error('Must be disconnected to reconnect.')
			err.type = 'disconnected'
			this.emit('error', err)
		}
		this.disconnected = true
	}

	destroy() {
		allPeers.delete(this.id)
		for(const connection of this.connectionMap.values())
			connection.host.connectionMap.delete(this.id)
		this.destroyed = true
		this.emit('close')
	}

	/**
	 * Convert map into object
	 * @return {Object<string, *>}
	 */
	get connections() {
		const connections = {}
		for(const [id, connection] of this.connectionMap)
			connections[id] = connection
		return connections
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
}

/**
 * A Mock of a WebRTC DataChannel
 */
export class MockDataConnection extends EventEmitter {
	/**
	 * @param {MockPeer} host
	 * @param {Object} options
	 */
	constructor(host, {
		label = '',
		metadata = { version: '0' },
		serialization = 'none',
		reliable = false,
	} = {}) {
		super()
		this.host = host
		this.peer = this.host.id

		this.open = true
		this.type = 'data'
		this.bufferSize = 0

		this.serialization = serialization
		this.reliable = reliable
		this.label = label
		this.metadata = metadata

		setTimeout(() => this.emit('open'), 0)
	}

	send(data) {
		this.client.emit('data', data)
	}

	close() {
		this.open = false
		this.emit('close')
	}

	/** @type {MockPeer} */
	get connectedPeer() {
		return this.client.host
	}
}