// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IPythonExtensionChecker } from '../../api/types';
import { InterpreterUri } from '../../common/installer/types';
import { IPythonExecutionFactory } from '../../common/process/types';
import { createDeferred, Deferred } from '../../common/utils/async';
import { isResource, noop } from '../../common/utils/misc';
import { IInterpreterService } from '../../interpreter/contracts';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { getTelemetrySafeHashedString, getTelemetrySafeVersion } from '../../telemetry/helpers';

const interestedPackages = new Set(
    [
        'ipykernel',
        'ipython-genutils',
        'jupyter',
        'jupyter-client',
        'jupyter-core',
        'nbconvert',
        'nbformat',
        'notebook',
        'pyzmq',
        'pyzmq32',
        'tornado',
        'traitlets'
    ].map((item) => item.toLowerCase())
);

@injectable()
export class InterpreterPackages {
    private static interpreterInformation = new Map<string, Deferred<Map<string, string>>>();
    private static pendingInterpreterInformation = new Map<string, Promise<void>>();
    private static instance?: InterpreterPackages;
    constructor(
        @inject(IPythonExtensionChecker) private readonly pythonExtensionChecker: IPythonExtensionChecker,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IPythonExecutionFactory) private readonly executionFactory: IPythonExecutionFactory
    ) {
        InterpreterPackages.instance = this;
    }
    public static getPackageVersions(interpreter: PythonEnvironment): Promise<Map<string, string>> {
        let deferred = InterpreterPackages.interpreterInformation.get(interpreter.path);
        if (!deferred) {
            deferred = createDeferred<Map<string, string>>();
            InterpreterPackages.interpreterInformation.set(interpreter.path, deferred);

            if (InterpreterPackages.instance) {
                InterpreterPackages.instance.trackInterpreterPackages(interpreter).catch(noop);
            }
        }
        return deferred.promise;
    }
    public trackPackages(interpreterUri: InterpreterUri, ignoreCache?: boolean) {
        this.trackPackagesInternal(interpreterUri, ignoreCache).catch(noop);
    }
    public async trackPackagesInternal(interpreterUri: InterpreterUri, ignoreCache?: boolean) {
        if (!this.pythonExtensionChecker.isPythonExtensionInstalled) {
            return;
        }
        let interpreter: PythonEnvironment;
        if (isResource(interpreterUri)) {
            // Get details of active interpreter for the Uri provided.
            const activeInterpreter = await this.interpreterService.getActiveInterpreter(interpreterUri);
            if (!activeInterpreter) {
                return;
            }
            interpreter = activeInterpreter;
        } else {
            interpreter = interpreterUri;
        }
        this.trackInterpreterPackages(interpreter, ignoreCache).catch(noop);
    }
    private async trackInterpreterPackages(interpreter: PythonEnvironment, ignoreCache?: boolean) {
        const key = interpreter.path;
        if (InterpreterPackages.pendingInterpreterInformation.has(key) && !ignoreCache) {
            return;
        }

        const promise = this.getPackageInformation(interpreter);
        promise.finally(() => {
            // If this promise was resolved, then remove it from the pending list.
            if (InterpreterPackages.pendingInterpreterInformation.get(key) === promise) {
                InterpreterPackages.pendingInterpreterInformation.delete(key);
            }
        });
        InterpreterPackages.pendingInterpreterInformation.set(key, promise);
    }
    private async getPackageInformation(interpreter: PythonEnvironment) {
        const service = await this.executionFactory.createActivatedEnvironment({
            allowEnvironmentFetchExceptions: true,
            bypassCondaExecution: true,
            interpreter
        });

        // Ignore errors, and merge the two (in case some versions of python write to stderr).
        const output = await service.execModule('pip', ['list'], { throwOnStdErr: false, mergeStdOutErr: true });
        const packageAndVersions = new Map<string, string>();
        // Add defaults.
        interestedPackages.forEach((item) => {
            packageAndVersions.set(getTelemetrySafeHashedString(item), 'NOT INSTALLED');
        });
        output.stdout
            .split('\n')
            .map((line) => line.trim().toLowerCase())
            .filter((line) => line.length > 0)
            .forEach((line) => {
                const parts = line.split(' ').filter((item) => item.trim().length);
                if (parts.length < 2) {
                    return;
                }
                const [packageName, rawVersion] = parts;
                if (!interestedPackages.has(packageName.toLowerCase().trim())) {
                    return;
                }
                const version = getTelemetrySafeVersion(rawVersion);
                packageAndVersions.set(getTelemetrySafeHashedString(packageName), version || '');
            });
        let deferred = InterpreterPackages.interpreterInformation.get(interpreter.path);
        if (!deferred) {
            deferred = createDeferred<Map<string, string>>();
            InterpreterPackages.interpreterInformation.set(interpreter.path, deferred);
        }
        deferred.resolve(packageAndVersions);
    }
}
