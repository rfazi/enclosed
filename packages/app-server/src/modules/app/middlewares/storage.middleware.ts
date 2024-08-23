import { createMiddleware } from 'hono/factory';
import type { Driver } from 'unstorage';
import { createStorage } from 'unstorage';
import cloudflareKVBindingDriver from 'unstorage/drivers/cloudflare-kv-binding';
import type { Config } from '../config/config.types';
import type { Context } from '../server.types';
import { createError } from '../../shared/errors/errors';

export function createStorageMiddleware({ driver: initialDriver }: { driver?: Driver } = {}) {
  return createMiddleware(async (context, next) => {
    if (initialDriver) {
      context.set('storage', createStorage({ driver: initialDriver }));

      await next();
      return;
    }

    const config = context.get('config');

    const { buildDriver } = getStorageDriverFactory({ driverType: config.storage.driver });
    const driver = buildDriver({ config, context });
    const storage = createStorage({ driver });

    context.set('storage', storage);

    await next();
  });
}

function getStorageDriverFactory({ driverType }: { driverType: string }) {
  const driverBuilders: Record<string, (args: { config: Config; context: Context }) => Driver> = {

    'cloudflare-kv-binding': ({ context, config }) => {
      const { bindingName } = config.storage.driverConfig.cloudflareKVBinding;
      const binding = (context.env as Record<string, KVNamespace | undefined>)[bindingName];

      if (!binding) {
        throw createError({
          message: `Missing Cloudflare KV binding: ${bindingName}`,
          code: 'missing_cloudflare_kv_binding',
          statusCode: 500,
          isInternal: true,
        });
      }

      return cloudflareKVBindingDriver({ binding });
    },
  };

  const buildDriver = driverBuilders[driverType];

  if (!buildDriver) {
    throw createError({
      message: `No storage driver builder found for: ${driverType}`,
      code: 'unknown_storage_driver',
      statusCode: 500,
      isInternal: true,
    });
  }

  return { buildDriver };
}
