import * as loom from 'loom-js'

class LoomProvider {
  /**
   * Constructs a new client to read & write data from/to a Loom DAppChain via web sockets.
   * @param chainId DAppChain identifier.
   * @param writeUrl Host & port to send txs, specified as "<protocol>://<host>:<port>".
   * @param readUrl Host & port of the DAppChain read/query interface, this should only be provided
   *                if it's not the same as `writeUrl`.
   */
  constructor({chainId, writeUrl, readUrl, libraryName = null, web3Api = null}) {
    this.chainId = chainId
    this.writeUrl = loom.createJSONRPCClient({ protocols: [{ url: writeUrl }] })
    this.readUrl = loom.createJSONRPCClient({ protocols: [{ url: readUrl }] })
    this.client = new loom.Client(this.chainId, this.writeUrl, this.readUrl)

    this._libraryName = libraryName
    this.web3Api = web3Api

    this.loomProvider = null
  }

  get library() {
    const providerToInject =
      this.loomProvider &&
      (() => {
        switch (this._libraryName) {
          case 'ethers.js':
            const ethers = this.web3Api
            return new ethers.providers.Web3Provider(this.loomProvider)
          case 'web3.js':
            const Web3 = this.web3Api
            return new Web3(this.loomProvider)
          case null:
            return this.loomProvider
        }
      })()
    return providerToInject
  }

  async hasMapping(addressMapper, from) {
    try {
      return await addressMapper.hasMappingAsync(from)
    } catch {
      return false
    }
  }

  // dirty hook
  setNetworkOnly(_privateKeyString = null) {
    const privateKey = _privateKeyString ? loom.CryptoUtils.B64ToUint8Array(_privateKeyString) : loom.CryptoUtils.generatePrivateKey()
    this.loomProvider = new loom.LoomProvider(this.client, privateKey)
  }

  async getMappingAddress(address, chainId = this.chainId) {
    const to = new loom.Address(chainId, loom.LocalAddress.fromHexString(address))
    const addressMapper = await loom.Contracts.AddressMapper.createAsync(this.client, to)
    if (await this.hasMapping(addressMapper, to)) {
      const mapping = await addressMapper.getMappingAsync(to)
      return mapping.to.local.toString()
    }

    return null
  }
}

export default LoomProvider
