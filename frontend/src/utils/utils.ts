export function splitProviderModel(value: string): { provider: string; modelName: string } {
    const [provider, ...rest] = value.split(":");
    return {
        provider,
        modelName: rest.join(":"),
    };
}
