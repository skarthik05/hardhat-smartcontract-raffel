const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { assert, expect } = require("chai")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async () => {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffle = await ethers.getContract("Raffle") // Returns a new connection to the Raffle contract
              //   raffle = raffleContract.connect(player) // Returns a new instance of the Raffle contract connected to player
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("Constructor", () => {
              it("Initializes the raffle correctly ", async () => {
                  const raffleState = (await raffle.getRaffleState()).toString()
                  assert.equal(raffleState, "0")
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      // is reverted when not paid enough or raffle is not open
                      "Raffle_NotEnoughETHEntered"
                  )
              })
              it("records player when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const contractPlayer = await raffle.getPlayer(0)
                  assert.equal(contractPlayer, deployer)
              })
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      // emits RaffleEnter event if entered to index player(s) address
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("doesn't allow entrance when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  // we pretend to be a keeper for a second
                  await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      // is reverted as raffle is calculating
                      "Raffle__NotOpen"
                  )
              })

              describe("checkUpkeep", function () {
                  it("returns false if people haven't sent any ETH", async () => {
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                      assert(!upkeepNeeded)
                  })
                  it("returns false if raffle isn't open", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      await raffle.performUpkeep([]) // changes the state to calculating
                      const raffleState = await raffle.getRaffleState() // stores the new state
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                      assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
                  })

                  it("returns false if enough time hasn't passed", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                      assert(!upkeepNeeded)
                  })
                  it("returns true if enough time has passed, has players, eth, and is open", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                      assert(upkeepNeeded)
                  })
              })
              describe("performUpkeep", function () {
                  it("can only run if checkupkeep is true", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const tx = await raffle.performUpkeep("0x")
                      assert(tx)
                  })
                  it("reverts if checkup is false", async () => {
                      await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                          "Raffle__UpkeepNotNeeded"
                      )
                  })
                  it("updates the raffle state and emits a requestId", async () => {
                      // Too many asserts in this test!
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const txResponse = await raffle.performUpkeep("0x") // emits requestId
                      const txReceipt = await txResponse.wait(1) // waits 1 block
                      const raffleState = await raffle.getRaffleState() // updates state
                      const requestId = txReceipt.events[1].args.requestId
                      assert(requestId.toNumber() > 0)
                      assert(raffleState == 1) // 0 = open, 1 = calculating
                  })
              })
          })
      })
