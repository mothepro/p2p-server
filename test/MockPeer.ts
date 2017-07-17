import * as EventEmitter from 'events'
// TODO Can this be done with Modular Resolution??
const Module = require('module')
const originalRequire = Module.prototype.require
Module.prototype.require = function() {
	if (arguments[0] === 'peerjs')
		return {default: MockPeer}
	return originalRequire.apply(this, arguments)
}

global['window'] = {
	RTCIceCandidate: {},
	RTCSessionDescription: {},
	RTCPeerConnection: {},
}

type peerID = string
type dcID = string

const allPeers: Map<peerID, MockPeer> = new Map

export default class MockPeer extends EventEmitter {
	destroyed: boolean = false
	disconnected: boolean = false
	connectionMap: Map<peerID, MockDataConnection> = new Map

	constructor(public id: peerID = MockPeer.randomID(), options?: object) {
		super()

		if(typeof id === 'object') {
			options = id
			id = MockPeer.randomID()
		}

		allPeers.set(this.id, this)
		setTimeout(() => this.emit('open', id), 0)
	}

	connect(id: peerID, options?: object) {
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
			const err = <any>Error('Must be disconnected to reconnect.')
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

	get connections(): { [id in peerID]: MockDataConnection } {
		const connections = {}
		for(const [id, connection] of this.connectionMap)
			connections[id] = connection
		return connections
	}

	static randomID() : string {
		let num = (new Date).getTime()
		num += Math.random()
		num *= 100
		const ret = <string>Math.floor(num).toString(36) // base 36
		return ret.substr(3, 7) // remove repetition
	}
}

/**
 * A Mock of a WebRTC DataChannel
 */
export class MockDataConnection extends EventEmitter {
	client: MockDataConnection
	readonly peer: peerID = this.host.id

	open: boolean = false

	readonly type: string = 'data'
	readonly bufferSize: number = 0
	readonly id: dcID
	readonly serialization: string
	readonly reliable: boolean
	readonly label: string
	readonly metadata: Object

	constructor(public host: MockPeer, {
		label = '',
		metadata = { version: '0' },
		serialization = 'none',
		reliable = false,
		connectionId = `dc_${MockPeer.randomID()}`,
	}: any = {}) {
		super()

		this.id = connectionId
		this.serialization = serialization
		this.reliable = reliable
		this.label = label
		this.metadata = metadata

		setTimeout(() => this.ready(), 0)
	}

	ready() {
		this.open = true
		this.emit('open')
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