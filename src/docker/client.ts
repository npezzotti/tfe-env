import { join } from 'node:path';
import type { Readable, Stream } from 'node:stream';
import Docker from 'dockerode';
import type { Logger } from '../util/logger.js';
import { TfeEnvConfig } from '../config/schema.js';
import type { OutputSink } from '../util/output.js';

const docker = new Docker();

export interface StreamLogsOptions {
  follow: boolean;
  since?: number
  until?: number
  tail?: number;
  sink: OutputSink;
  signal?: AbortSignal;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;      // e.g. "running", "created"
  image: string;
  startedAt: string;   // State.StartedAt
}

/** Narrows an unknown catch value to a Docker HTTP error with a status code. */
function isDockerError(err: unknown): err is { statusCode: number; message: string } {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}

export type DockerVersionInfo = {
  Version: string;
  ApiVersion: string;
};

export async function getDockerVersionInfo(): Promise<DockerVersionInfo> {
  return new Promise<DockerVersionInfo>((resolve, reject) => {
    docker.version((err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        Version: data?.Version || '',
        ApiVersion: data?.ApiVersion || '',
      });
    });
  });
}

/**
 * Calls `inspect()` on any dockerode resource object and returns whether it
 * exists.  A 404 response is treated as "not found → false"; all other errors
 * are rethrown unchanged.
 */
async function resourceExists(resource: { inspect(): Promise<unknown> }): Promise<boolean> {
  try {
    await resource.inspect();
    return true;
  } catch (err) {
    if (isDockerError(err) && err.statusCode === 404) {
      return false;
    }
    throw err;
  }
}

/** Verifies the Docker daemon is reachable, throwing a friendly error if not. */
export function checkDockerRunning(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    docker.ping((err, _data) => {
      if (err) {
        reject(
          new Error(
            'Docker does not appear to be running. Please ensure Docker is installed and running, and that your user has permission to access the Docker daemon.'
          )
        );
        return;
      }
      resolve();
    });
  });
}

/** Returns true if the image is present locally. Rethrows any error other than "not found". */
export function imageExists(imageName: string): Promise<boolean> {
  return resourceExists(docker.getImage(imageName));
}

export async function pullImage(imageName: string, licenseKey: string, logger: Logger): Promise<void> {
  logger.info(`Pulling image: ${imageName}`);
  return new Promise<void>((resolve, reject) => {
    docker.pull(imageName).then((stream) => {
      docker.modem.followProgress(
        stream,
        (err, _output) => {
          if (err) {
            reject(new Error(`Failed to pull image ${imageName}: ${err.message}`));
            return;
          }
          resolve();
        },
        (event) => {
          if (event.status) {
            logger.info(event.status);
          }
        }
      );
    }).catch((err) => {
      reject(new Error(`Failed to initiate pull for image ${imageName}: ${err.message}`));
    });
  });
}

/** Named volume shared with TFE task workers; must be removed on destroy. */
export const DISK_CACHE_VOLUME = "tfe-env-disk-cache";

/**
 * Creates and starts the TFE container. `onCreated` is invoked as soon as the container
 * exists (before it is started) so callers can persist its identity: if `start()` fails,
 * the created container is left behind and must be found and removed later.
 */
export async function startContainer(
  imageName: string,
  config: TfeEnvConfig,
  workDir: string,
  onCreated?: (created: Pick<ContainerInfo, 'id' | 'name'>) => void,
): Promise<ContainerInfo> {
  const optionalEnv = [
    ...(config.capacityConcurrency ? [`TFE_CAPACITY_CONCURRENCY=${config.capacityConcurrency}`] : []),
    ...(config.capacityMemory ? [`TFE_CAPACITY_MEMORY=${config.capacityMemory}`] : []),
    ...(config.tfeRunPipelineImage ? [`TFE_RUN_PIPELINE_IMAGE=${config.tfeRunPipelineImage}`] : []),
  ];

  const container = await docker.createContainer({
    Image: imageName,
    Env: [
      `TFE_LICENSE=${config.licenseKey}`,
      `TFE_HOSTNAME=${config.hostname}`,
      `TFE_ENCRYPTION_PASSWORD=${config.encryptionPassword}`,
      "TFE_OPERATIONAL_MODE=disk",
      `TFE_DISK_CACHE_VOLUME_NAME=${DISK_CACHE_VOLUME}`,
      `TFE_TLS_CERT_FILE=${config.tls.certFile}`,
      `TFE_TLS_KEY_FILE=${config.tls.keyFile}`,
      `TFE_TLS_CA_BUNDLE_FILE=${config.tls.caBundle}`,
      `TFE_IACT_TOKEN=${config.iactToken}`,
      `TFE_METRICS_ENABLE=true`,
      ...optionalEnv,
    ],
    HostConfig: {
      CapAdd: ["IPC_LOCK"],
      ReadonlyRootfs: true,
      Tmpfs: {
        "/tmp": "mode=01777",
        ["/run"]: "",
        ["/var/log/terraform-enterprise"]: ""
      },
      PortBindings: {
        "443/tcp": [{ HostPort: "443" }],
        "80/tcp": [{ HostPort: "80" }],
      },
      Binds: [
        "/var/run/docker.sock:/var/run/docker.sock",
        `${join(workDir, 'certs')}:/etc/ssl/private/terraform-enterprise`,
        `${join(workDir, 'data')}:/var/lib/terraform-enterprise`,
        `${DISK_CACHE_VOLUME}:/var/cache/tfe-task-worker/terraform`,
      ],
    },
    Volumes: {
      [DISK_CACHE_VOLUME]: {},
    }
  });

  if (onCreated) {
    const created = await container.inspect();
    onCreated({ id: created.Id, name: created.Name.replace(/^\//, '') });
  }

  await container.start();
  const data = await container.inspect();
  return {
    id: data.Id,
    name: data.Name.replace(/^\//, ''),
    status: data.State.Status,
    image: data.Config.Image,
    startedAt: data.State.StartedAt,
  }
}

export async function getContainerUptime(containerName: string): Promise<number> {
  const data = await docker.getContainer(containerName).inspect();
  if (!data.State.Running) {
    throw new Error(`Container ${containerName} is not running.`);
  }
  return Date.now() - new Date(data.State.StartedAt).getTime();
}

/** Stops (if running) and removes the container. A missing container is not an error. */
export async function stopContainer(containerName: string, logger: Logger): Promise<void> {
  const container = docker.getContainer(containerName);
  try {
    const { State } = await container.inspect();
    // Only a running (or paused/restarting) container can be stopped; stopping
    // an exited or just-created one makes the Docker API respond with an error.
    if (State.Running) {
      await container.stop();
    }
    await container.remove();
  } catch (err) {
    // Docker responds 404 if the container is gone (checked before or removed concurrently).
    if (isDockerError(err) && err.statusCode === 404) {
      logger.debug(`Container ${containerName} does not exist. Nothing to remove.`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    throw new Error(`Failed to stop container ${containerName}: ${message}`, { cause: err });
  }
}

/** Returns true if the container exists (in any state). Rethrows any error other than "not found". */
export function containerExists(containerName: string): Promise<boolean> {
  return resourceExists(docker.getContainer(containerName));
}

export async function containerRunning(containerName: string): Promise<boolean> {
  const status = await getContainerStatus(containerName);
  if (status != 'stopped') return true;
  return false;
}

export async function findContainerStatus(containerName: string): Promise<string | null> {
  try {
    const data = await docker.getContainer(containerName).inspect();
    return data.State.Status;
  } catch (err) {
    if (isDockerError(err) && err.statusCode === 404) return null;
    throw new Error(
      `Failed to get status for container ${containerName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Returns the container's status (e.g. "running"). Throws if the container does not exist. */
async function getContainerStatus(containerName: string): Promise<string> {
  const status = await findContainerStatus(containerName);
  if (status === null) throw new Error(`Container ${containerName} does not exist.`);
  return status;
}

/** Resolves when the stream ends or closes; rejects on stream error. */
function waitForStreamEnd(stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.once('end', resolve);
    stream.once('close', resolve);
    stream.once('error', reject);
  });
}

/** Attaches the local terminal to an exec stream (raw mode, stdin piping, window resizing)
 *  and resolves once the remote side finishes. Always restores the terminal state. */
async function runInteractive(exec: Docker.Exec, stream: Stream.Duplex): Promise<void> {
  const { stdin, stdout } = process;
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;

  const onSigwinch = () => {
    exec.resize({ w: stdout.columns, h: stdout.rows }).catch(() => { });
  };

  try {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.pipe(stream);
    stream.pipe(stdout, { end: false });
    process.on('SIGWINCH', onSigwinch);
    onSigwinch(); // sync the remote pty size with the local terminal immediately

    await waitForStreamEnd(stream);
  } finally {
    process.removeListener('SIGWINCH', onSigwinch);
    stdin.unpipe(stream);
    stdin.pause(); // let the event loop exit once we're done
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
  }
}

export type ExecOptions =
  | { tty: true; signal?: AbortSignal }
  | { tty?: false; sink?: OutputSink; signal?: AbortSignal };

/** Runs a command inside a running container, streaming its output to stdout/stderr.
 *  Returns the numeric exit code of the executed command. Throws only on Docker-level errors.
 *  When `tty` is true, the local terminal is attached interactively (stdout and stderr are merged). */
export async function execInContainer(
  name: string,
  cmd: string[],
  opts: ExecOptions = {}):
  Promise<number> {
  let exec: Docker.Exec;
  try {
    exec = await docker.getContainer(name).exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: opts.tty,
      AttachStdin: opts.tty,
    });
  } catch (err) {
    throw new Error(
      `Failed to create exec in container ${name}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  const stream = await exec.start({ hijack: true, stdin: opts.tty, Tty: opts.tty });

  const onAbort = () => stream.destroy();
  if (opts.signal?.aborted) { stream.destroy(); } else {
    opts.signal?.addEventListener('abort', onAbort, { once: true });
  }

  try {
    if (opts.tty) {
      await runInteractive(exec, stream);
    } else {
      const sink = opts.sink ?? { stdout: process.stdout, stderr: process.stderr };
      docker.modem.demuxStream(stream, sink.stdout, sink.stderr);
      await waitForStreamEnd(stream);
    }
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }

  if (opts.signal?.aborted) {
    throw new Error('Command aborted');
  }

  const { ExitCode } = await exec.inspect();
  if (ExitCode === null) {
    throw new Error(`Command [${cmd.join(' ')}] in container ${name} exited with an unknown exit code (null).`);
  }
  return ExitCode;
}

function openLogStream(containerId: string, opts: StreamLogsOptions): Promise<Readable> {
  const query: Record<string, string | number | boolean> = {
    stdout: true,
    stderr: true,
    follow: opts.follow,
  };

  // Docker's logs API takes Unix timestamps in seconds; callers pass epoch milliseconds.
  if (opts.since) {
    query.since = Math.floor(opts.since / 1000);
  }

  if (opts.until) {
    query.until = Math.floor(opts.until / 1000);
  }

  if (opts.tail !== undefined) {
    query.tail = opts.tail;
  }

  return new Promise((resolve, reject) => {
    docker.modem.dial(
      {
        path: `/containers/${containerId}/logs?`,
        method: "GET",
        isStream: true,
        statusCodes: { 200: true, 404: "no such container", 500: "server error" },
        options: query,
      },
      (err, stream) => (err ? reject(err) : resolve(stream as Readable)),
    );
  });
}

function pipeLogs(source: Readable, sink: OutputSink, isTty: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    source.once("error", reject);
    source.once("end", resolve);
    source.once("close", resolve); // destroyed (e.g. Ctrl+C) before ending

    if (isTty) {
      // TTY containers send raw bytes; stdout and stderr are already merged.
      source.pipe(sink.stdout, { end: false });
    } else {
      // Non-TTY containers multiplex stdout/stderr with an 8-byte header per frame.
      docker.modem.demuxStream(source, sink.stdout, sink.stderr);
    }
  });
}

export async function streamContainerLogs(
  containerName: string,
  opts: StreamLogsOptions,
): Promise<void> {
  let info: Docker.ContainerInspectInfo;
  try {
    info = await docker.getContainer(containerName).inspect();
  } catch (err) {
    if (isDockerError(err) && err.statusCode === 404) {
      throw new Error(`Container '${containerName}' does not exist.`);
    }
    throw err;
  }

  const stream = await openLogStream(info.Id, opts);

  const onAbort = () => stream.destroy();
  if (opts.signal?.aborted) { stream.destroy(); } else {
    opts.signal?.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await pipeLogs(stream, opts.sink, info.Config.Tty);
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function removeVolume(name: string): Promise<void> {
  try {
    await docker.getVolume(name).remove();
  } catch (err) {
    // Docker responds 404 if the volume is already gone; treat that as success.
    if (isDockerError(err) && err.statusCode === 404) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to remove volume ${name}: ${message}`, { cause: err });
  }
}