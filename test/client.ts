import 'should'
import * as mock from 'mock-require'

import MockPeer = require('./stubs/MockPeer')
import {MockDataConnection} from './stubs/MockPeer'
mock('peerjs', MockPeer)
import Client from '../src/Client'
import Server from '../src/Server'

const key = 'test-key' // TEST API Key
const version = 'test-version' // TEST Default Version

/**
 * Get the peer on the other side of the client
 */
function connectedPeer(peer: Client): MockPeer {
	const mockPeer = <any>peer.host
	const mockDC = mockPeer.client
    return mockDC.host
}

describe('Connecting', () => {
	it('should connect', function (done) {
		const host = new Server({key, version})

		host.once('ready', hostID => {
			const friend = new Client({key, hostID, version})

			friend.once('connection', () => {
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
		const message = {
			hello: 'world'
		}
		const host = new Server({key, version})
		let friend: Client

		host.once('ready', hostID => {
			friend = new Client({key, hostID, version})
			friend.once('connection', () => friend.send(message))
		})

        host.once('data', ({from, data}) => {
        	const friendDC: MockDataConnection = <any>friend.host
        	friendDC.client.id.should.eql(from)
            connectedPeer(friend).should.eql(host.peer)

            message.should.eql(data)
            done()
        })
	})

	it('should send a message to a client', function (done) {
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Server({key, version})

		host.once('ready', hostID => {
			host.once('clientConnection', hostConnectionToFriend => {
				friend.once('data', ({from, data}) => {
					//(from === undefined).should.be.true()
					from.should.equal(friend.host.id)
					message.should.eql(data)

					done()
				})

				host.send(message, hostConnectionToFriend)
			})

			const friend = new Client({key, hostID, version})
		})
	})

	it('should direct message another client', function (done) {
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Server({key, version})

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

				const friend2 = new Client({key, hostID, version})
			})

			const friend = new Client({key, hostID, version})
		})
	})
})

describe('Broadcasting', () => {
	it('should broadcast a message to clients', function () {
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Server({key, version})

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
                            msg.from.should.equal('')
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})

						host.broadcast(message)
					})

					const friend2 = new Client({key, hostID, version})
				})

				const friend = new Client({key, hostID, version})
			})
		})
	})

	it('should broadcast a message to other clients', function () {
		const message = {
			name: 'mo',
			age: 12.6,
			map: new Map([[1, 5], [2, 6]])
		}

		const host = new Server({key, version})

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
							msg.from.should.equal(hostConnectionToFriendTwo.id)
							message.should.eql(msg.data)

							if(++times === 3)
								resolve()
						})

						friend2.broadcast(message)
					})

					const friend2 = new Client({key, hostID, version})
				})

                const friend = new Client({key, hostID, version})
            })
        })
    })

    it('should only forward a message to other clients', function () {
        const message = {
            name: 'mo',
            age: 12.6,
            map: new Map([[1, 5], [2, 6]])
        }

        const host = new Server({key, version})

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

                            if(++times === 2)
                                resolve()
                        })
                        friend2.once('data', (msg) =>
							reject('Forwarding should not emit an event to oneself.'))
                        host.once('data', (msg) => {
                            msg.from.should.equal(hostConnectionToFriendTwo.id)
                            message.should.eql(msg.data)

                            if(++times === 2)
                                resolve()
                        })

                        friend2.broadcast(message, false)
                    })

                    const friend2 = new Client({key, hostID, version})
                })

                const friend = new Client({key, hostID, version})
            })
        })
    })
})
