// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { assert } from 'chai';
import * as sinon from 'sinon';
import { anything, instance, mock, when } from 'ts-mockito';

import { EventEmitter } from 'vscode';
import { ApplicationShell } from '../../../../client/common/application/applicationShell';
import { IApplicationShell } from '../../../../client/common/application/types';
import { ConfigurationService } from '../../../../client/common/configuration/service';
import { PYTHON_LANGUAGE } from '../../../../client/common/constants';
import { IDisposable } from '../../../../client/common/types';
import * as localize from '../../../../client/common/utils/localize';
import { noop } from '../../../../client/common/utils/misc';
import { KernelSelectionProvider } from '../../../../client/datascience/jupyter/kernels/kernelSelections';
import { KernelSelector } from '../../../../client/datascience/jupyter/kernels/kernelSelector';
import { KernelConnectionMetadata } from '../../../../client/datascience/jupyter/kernels/types';
import {
    IJupyterConnection,
} from '../../../../client/datascience/types';
import { PythonEnvironment } from '../../../../client/pythonEnvironments/info';
import { disposeAllDisposables } from '../../../../client/common/helpers';
import { InterpreterPackages } from '../../../../client/datascience/telemetry/interpreterPackages';



/* eslint-disable , @typescript-eslint/no-unused-expressions, @typescript-eslint/no-explicit-any */

suite('DataScience - KernelSelector', () => {
    let kernelSelectionProvider: KernelSelectionProvider;
    let kernelSelector: KernelSelector;
    let appShell: IApplicationShell;
    const dummyEvent = new EventEmitter<number>();
    const kernelSpec = {
        argv: [],
        display_name: 'Something',
        dispose: async () => noop(),
        language: PYTHON_LANGUAGE,
        name: 'SomeName',
        path: 'somePath',
        env: {}
    };
    const interpreter: PythonEnvironment = {
        displayName: 'Something',
        path: 'somePath',
        sysPrefix: '',
        sysVersion: '',
        version: { raw: '3.7.1.1', major: 3, minor: 7, patch: 1, build: ['1'], prerelease: [] }
    };
    const kernelMetadata: KernelConnectionMetadata = {
        kind: 'startUsingPythonInterpreter',
        kernelSpec,
        interpreter
    };

    const remoteKernelMetadata: KernelConnectionMetadata = {
        kind: 'startUsingKernelSpec',
        kernelSpec: {
            ...kernelSpec,
            display_name: 'My remote kernel'
        }
    }
    const connection: IJupyterConnection = {
        baseUrl: 'http://remotehost:9999',
        valid: true,
        localLaunch: false,
        type: 'jupyter',
        displayName: 'test',
        hostName: 'remotehost',
        disconnected: dummyEvent.event,
        token: '',
        localProcExitCode: 0,
        rootDirectory: '',
        dispose: noop
    }
    const disposableRegistry: IDisposable[] = [];
    setup(() => {
        kernelSelectionProvider = mock(KernelSelectionProvider);
        appShell = mock(ApplicationShell);
        when(appShell.showErrorMessage(anything(), anything(), anything())).thenResolve(localize.DataScience.selectKernel() as any)
        when(appShell.showQuickPick(anything(), anything(), anything())).thenCall((a, _b, _c) => {
            return Promise.resolve(a[0]);
        })

        const configService = mock(ConfigurationService);
        kernelSelector = new KernelSelector(
            instance(kernelSelectionProvider),
            instance(appShell),
            instance(configService),
            instance(mock(InterpreterPackages))
        );
    });
    teardown(() => {
        sinon.restore();
        disposeAllDisposables(disposableRegistry);
    });
    test('Remote kernels are asked for', async () => {
        when(kernelSelectionProvider.getKernelSelections(anything(), connection, anything())).thenResolve([
             {   label: '',
                ...remoteKernelMetadata,
                description: '',
                selection: remoteKernelMetadata
            }
        ]);
        const result = await kernelSelector.selectJupyterKernel(undefined, connection, undefined, 'foo');
        assert.deepEqual(result, remoteKernelMetadata);
    });
    test('Local kernels are asked for', async () => {
        when(kernelSelectionProvider.getKernelSelections(anything(), anything(), anything())).thenResolve([
            {   label: '',
               ...kernelMetadata,
               description: '',
               selection: kernelMetadata
           }
       ]);
       const result = await kernelSelector.askForLocalKernel(undefined, undefined, kernelMetadata);
       assert.deepEqual(result, kernelMetadata);

    });
});
