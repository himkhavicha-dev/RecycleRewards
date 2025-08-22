// RecycleToken.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MintRecord {
  amount: number;
  recipient: string;
  metadata: string;
  timestamp: number;
  minter: string;
}

interface ContractState {
  balances: Map<string, number>;
  minters: Map<string, boolean>;
  mintRecords: Map<number, MintRecord>;
  allowances: Map<string, number>; // key: `${owner}:${spender}`
  totalSupply: number;
  paused: boolean;
  admin: string;
}

// Mock contract implementation
class RecycleTokenMock {
  private state: ContractState = {
    balances: new Map(),
    minters: new Map(),
    mintRecords: new Map(),
    allowances: new Map(),
    totalSupply: 0,
    paused: false,
    admin: "deployer",
  };

  private MAX_METADATA_LEN = 500;
  private ERR_UNAUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_INVALID_RECIPIENT = 103;
  private ERR_INVALID_MINTER = 104;
  private ERR_ALREADY_REGISTERED = 105;
  private ERR_METADATA_TOO_LONG = 106;
  private ERR_INSUFFICIENT_BALANCE = 107;
  private ERR_INVALID_SENDER = 108;

  constructor() {
    this.state.minters.set("deployer", true);
  }

  getName(): ClarityResponse<string> {
    return { ok: true, value: "RecycleToken" };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: "RT" };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: 6 };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getMintRecord(id: number): ClarityResponse<MintRecord | null> {
    return { ok: true, value: this.state.mintRecords.get(id) ?? null };
  }

  isMinter(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.minters.get(account) ?? false };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getAllowance(owner: string, spender: string): ClarityResponse<number> {
    const key = `${owner}:${spender}`;
    return { ok: true, value: this.state.allowances.get(key) ?? 0 };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  addMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.minters.has(minter)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.minters.set(minter, true);
    return { ok: true, value: true };
  }

  removeMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.minters.set(minter, false);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, metadata: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === caller) { // Example rule
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    const mintId = this.state.totalSupply; // Simplified
    this.state.mintRecords.set(mintId, {
      amount,
      recipient,
      metadata,
      timestamp: Date.now(),
      minter: caller,
    });
    return { ok: true, value: true };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_INVALID_SENDER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const balance = this.state.balances.get(caller) ?? 0;
    if (balance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(caller, balance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  setAllowance(caller: string, spender: string, amount: number): ClarityResponse<boolean> {
    const key = `${caller}:${spender}`;
    this.state.allowances.set(key, amount);
    return { ok: true, value: true };
  }

  transferFrom(caller: string, amount: number, owner: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const key = `${owner}:${caller}`;
    const allowance = this.state.allowances.get(key) ?? 0;
    if (allowance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    const ownerBalance = this.state.balances.get(owner) ?? 0;
    if (ownerBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(owner, ownerBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    this.state.allowances.set(key, allowance - amount);
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  minter: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("RecycleToken Contract", () => {
  let contract: RecycleTokenMock;

  beforeEach(() => {
    contract = new RecycleTokenMock();
  });

  it("should initialize with correct token metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "RecycleToken" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "RT" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to add minter", () => {
    const addMinter = contract.addMinter(accounts.deployer, accounts.minter);
    expect(addMinter).toEqual({ ok: true, value: true });

    const isMinter = contract.isMinter(accounts.minter);
    expect(isMinter).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from adding minter", () => {
    const addMinter = contract.addMinter(accounts.user1, accounts.user2);
    expect(addMinter).toEqual({ ok: false, value: 100 });
  });

  it("should allow minter to mint tokens with metadata", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    
    const mintResult = contract.mint(
      accounts.minter,
      1000000, // 1 RT with 6 decimals
      accounts.user1,
      "Recycled 1kg plastic"
    );
    expect(mintResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000000 });

    const mintRecord = contract.getMintRecord(1000000);
    expect(mintRecord).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 1000000,
        recipient: accounts.user1,
        metadata: "Recycled 1kg plastic",
        minter: accounts.minter,
      }),
    });
  });

  it("should prevent non-minter from minting", () => {
    const mintResult = contract.mint(
      accounts.user1,
      1000000,
      accounts.user1,
      "Unauthorized mint"
    );
    expect(mintResult).toEqual({ ok: false, value: 104 });
  });

  it("should allow token transfer between users", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");

    const transferResult = contract.transfer(
      accounts.user1,
      500000,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500000 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500000 });
  });

  it("should prevent transfer of insufficient balance", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");

    const transferResult = contract.transfer(
      accounts.user1,
      200000,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: false, value: 107 });
  });

  it("should allow burning tokens", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");

    const burnResult = contract.burn(accounts.user1, 300000);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 700000 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mint(
      accounts.deployer,
      1000000,
      accounts.user1,
      "Paused mint"
    );
    expect(mintDuringPause).toEqual({ ok: false, value: 101 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent metadata exceeding max length", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    
    const longMetadata = "a".repeat(501);
    const mintResult = contract.mint(
      accounts.minter,
      1000000,
      accounts.user1,
      longMetadata
    );
    expect(mintResult).toEqual({ ok: false, value: 106 });
  });

  it("should handle allowances and transfer-from", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");

    const setAllowance = contract.setAllowance(accounts.user1, accounts.user2, 500000);
    expect(setAllowance).toEqual({ ok: true, value: true });
    expect(contract.getAllowance(accounts.user1, accounts.user2)).toEqual({ ok: true, value: 500000 });

    const transferFrom = contract.transferFrom(accounts.user2, 300000, accounts.user1, accounts.user2);
    expect(transferFrom).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700000 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 300000 });
    expect(contract.getAllowance(accounts.user1, accounts.user2)).toEqual({ ok: true, value: 200000 });
  });

  it("should prevent transfer-from without sufficient allowance", () => {
    contract.addMinter(accounts.deployer, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");

    contract.setAllowance(accounts.user1, accounts.user2, 200000);

    const transferFrom = contract.transferFrom(accounts.user2, 300000, accounts.user1, accounts.user2);
    expect(transferFrom).toEqual({ ok: false, value: 107 });
  });
});