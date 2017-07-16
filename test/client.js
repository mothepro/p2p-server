import should from 'should'
import MockPeer, {MockDataConnection} from './MockPeer'
import Module from 'module'

const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
	if (arguments[0] === 'peerjs')
		return MockPeer
	return originalRequire.apply(this, arguments);
}

// Dynamic require to use PeerJS Mocker
const {default: Client} = require( '../src/Client' )
const {default: Host} = require( '../src/Host' )

describe('Connecting', () => {
	it('should connect', function (done) {
		const hostID = 'pootis'
		const host = new Host(hostID)

		host.once('ready', hostID => {
			const friend = new Client({hostID})

			friend.once('ready', () => {
				friend.should.be.instanceof(Client)
				friend.peer.should.be.instanceof(MockPeer)
				friend.host.should.be.instanceof(MockDataConnection)

				friend.host.connectedPeer.should.eql(host.peer)
				done()
			})
		})
	})
})

describe('Messaging', () => {
	it('should send a message to the host', function (done) {
		const version = 6
		const message = {
			hello: 'world'
		}
		const host = new Host({version})

		host.once('ready', hostID => {
			const friend = new Client({hostID, version})

			friend.once('ready', () => {
				host.once('data', ({from, data}) => {
					from.should.be.instanceof(MockDataConnection)
					friend.host.connectedPeer.should.eql(from.host)

					message.should.eql(data)
					done()
				})

				friend.send(message)
			})
		})
	})

	it('should send a message to a client', function (done) {
		const version = 6
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		host.once('ready', hostID => {
			host.once('connection', hostConnectionToFriend => {
				friend.once('data', ({from, data}) => {
					//(from === undefined).should.be.true()
					from.should.equal(friend.host.id)
					message.should.eql(data)

					done()
				})

				host.sendTo(hostConnectionToFriend, message)
			})

			const friend = new Client({hostID, version})
		})
	})

	it('should direct message another client', function (done) {
		const version = 6
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		host.once('ready', hostID => {
			host.once('connection', hostConnectionToFriend => {
				host.once('connection', hostConnectionToFriendTwo => {
					friend2.once('data', (msg) => {
						msg.from.should.equal(hostConnectionToFriend.id)
						message.should.eql(msg.data)
						done()
					})

					friend.send(message, hostConnectionToFriendTwo.id)
				})

				const friend2 = new Client({hostID, version})
			})

			const friend = new Client({hostID, version})
		})
	})
})

describe('Broadcasting', () => {
	it('should broadcast a message to clients', function () {
		const version = 6
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		return new Promise((resolve, reject) => {
			host.once('ready', hostID => {
				host.once('connection', hostConnectionToFriend => {
					host.clients.size.should.equal(1)

					host.once('connection', hostConnectionToFriendTwo => {
						host.clients.size.should.equal(2)

						let times = 0

						friend.once('data', (msg) => {
							msg.from.should.equal(friend.host.id)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})
						friend2.once('data', (msg) => {
							msg.from.should.equal(friend2.host.id)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})
						host.once('data', (msg) => {
							should.not.exist(msg.from)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})

						host.broadcast(message)
					})

					const friend2 = new Client({hostID, version})
				})

				const friend = new Client({hostID, version})
			})
		})
	})

	it('should broadcast a message to other clients', function () {
		const version = 6
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		return new Promise((resolve, reject) => {
			host.once('ready', hostID => {
				host.once('connection', hostConnectionToFriend => {
					host.clients.size.should.equal(1)

					host.once('connection', hostConnectionToFriendTwo => {
						host.clients.size.should.equal(2)

						let times = 0

						friend.once('data', (msg) => {
							msg.from.should.equal(hostConnectionToFriendTwo.id)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})
						friend2.once('data', (msg) => {
							//(msg.from === undefined).should.be.true()
							msg.from.should.equal(friend2.host.id)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})
						host.once('data', (msg) => {
							msg.from.should.equal(hostConnectionToFriendTwo)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})

						friend2.broadcast(message)
					})

					const friend2 = new Client({hostID, version})
				})

				const friend = new Client({hostID, version})
			})
		})
	})
})