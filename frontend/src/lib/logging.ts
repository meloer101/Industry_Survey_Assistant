type EnvLike = {
  DEV?: boolean;
  MODE?: string;
};

export function shouldLogInDev(env: EnvLike = import.meta.env): boolean {
  return env.DEV === true && env.MODE === "development";
}

export function devWarn(message: string, ...args: unknown[]): void {
  if (shouldLogInDev()) {
    console.warn(message, ...args);
  }
}
