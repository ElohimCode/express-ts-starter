import argon2 from 'argon2';
import { IPasswordHasher } from '../domain/password-hasher.interface.js';

export function createArgon2PasswordHasher(): IPasswordHasher {
  async function hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  async function verify(hashVal: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hashVal, plain);
    } catch {
      return false;
    }
  }

  return {
    hash,
    verify,
  };
}

export class Argon2PasswordHasher implements IPasswordHasher {
  private hasher: IPasswordHasher = createArgon2PasswordHasher();
  hash(plain: string) {
    return this.hasher.hash(plain);
  }
  verify(hashVal: string, plain: string) {
    return this.hasher.verify(hashVal, plain);
  }
}
