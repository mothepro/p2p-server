import * as should from 'should'
import MockPeer, {MockDataConnection} from './stubs/MockPeer'
import Client from '../src/Client'
import Host from '../src/Host'

/**
 * Get the peer on the other side of the client
 * @param peer
 */
function connectedPeer(peer: Client): MockPeer {
	const mockPeer = <MockDataConnection>peer.host
	const mockDC = mockPeer.client
    return mockDC.host
}

describe('Connecting', () => {
	it('should connect', function (done) {
		const host = new Host

		host.once('ready', hostID => {
			const friend = new Client({hostID})

			friend.once('ready', () => {
				friend.should.be.instanceof(Client)
				friend.peer.should.be.instanceof(MockPeer)
				friend.host.should.be.instanceof(MockDataConnection)

				connectedPeer(friend).should.eql(host.peer)
				done()
			})
		})
	})
})

describe('Messaging', () => {
	it('should send a message to the host', function (done) {
		const version = '6'
		const message = {
			hello: 'world'
		}
		const host = new Host({version})

		host.once('ready', hostID => {
			const friend = new Client({hostID, version})

			friend.once('ready', () => {
				host.once('data', ({from, data}) => {
					from.should.be.instanceof(MockDataConnection)
					connectedPeer(friend).should.eql(from.host)

					message.should.eql(data)
					done()
				})

				friend.send(message)
			})
		})
	})

	it('should send a message to a client', function (done) {
		const version = '6'
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		host.once('ready', hostID => {
			host.once('clientConnection', hostConnectionToFriend => {
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
		const version = '6'
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		host.once('ready', hostID => {
			host.once('clientConnection', hostConnectionToFriend => {
				host.once('clientConnection', hostConnectionToFriendTwo => {
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
		const version = '6'
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		return new Promise((resolve, reject) => {
			host.once('ready', hostID => {
				host.once('clientConnection', hostConnectionToFriend => {
					host.clients.size.should.equal(1)

					host.once('clientConnection', hostConnectionToFriendTwo => {
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
		const version = '6'
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Host({version})

		return new Promise((resolve, reject) => {
			host.once('ready', hostID => {
				host.once('clientConnection', hostConnectionToFriend => {
					host.clients.size.should.equal(1)

					host.once('clientConnection', hostConnectionToFriendTwo => {
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