// **********************************************************************
//
// Copyright (c) 2003-2017 ZeroC, Inc. All rights reserved.
//
// This copy of Ice is licensed to you under the terms described in the
// ICE_LICENSE file included in this distribution.
//
// **********************************************************************

 /* global
    _test : false,
    _runServer : false,
    _server: false,
    Test : false,
    WorkerGlobalScope: false
*/

var process = { argv : [] };

function isSafari()
{
    return /^((?!chrome).)*safari/i.test(navigator.userAgent);
}

function isChrome()
{
    //
    // We need to check for Edge browser as it might include Chrome in its user agent.
    //
    return navigator.userAgent.indexOf("Edge/") === -1 &&
           navigator.userAgent.indexOf("Chrome/") !== -1;
}

function isWorker()
{
    return typeof(WorkerGlobalScope) !== 'undefined' && this instanceof WorkerGlobalScope;
}

function isWindows()
{
    return navigator.userAgent.indexOf("Windows") != -1;
}

function runTest(testsuite, language, host, protocol, testcases, out)
{
    //
    // This logger is setup to work with Web Workers and normal scripts using
    // the received out object. With some browser like Safari using console.log
    // method doesn't work when running inside a web worker.
    //
    var Logger =
    {
        print:function(message)
        {
            out.writeLine(message, false);
        },
        trace:function(category, message)
        {
            var s = [];
            var d = new Date();
            s.push("-- ");
            s.push(this.timestamp());
            s.push(' ');
            s.push(this._prefix);
            s.push(category);
            s.push(": ");
            s.push(message);
            out.writeLine(s.join(""), true);
        },
        warning:function(message)
        {
            var s = [];
            var d = new Date();
            s.push("-! ");
            s.push(this.timestamp());
            s.push(' ');
            s.push(this._prefix);
            s.push("warning: ");
            s.push(message);
            out.writeLine(s.join(""), true);
        },
        error:function(message)
        {
            var s = [];
            var d = new Date();
            s.push("!! ");
            s.push(this.timestamp());
            s.push(' ');
            s.push(this._prefix);
            s.push("error: ");
            s.push(message);
            out.writeLine(s.join(""), true);
        },
        getPrefix: function()
        {
            return "";
        },
        cloneWithPrefix: function(prefix)
        {
            return Logger;
        },
        timestamp:function()
        {
            var d = new Date();
            return d.toLocaleString("en-US", this._dateformat) + "." + d.getMilliseconds();
        }
    };

    var communicator;
    var id = new Ice.InitializationData();
    var port = protocol == "ws" ? 15002 : 15003;
    id.logger = Logger;
    id.properties = Ice.createProperties();
    id.properties.setProperty("Ice.Default.Host", host);
    id.properties.setProperty("Ice.Default.Protocol", protocol);
    //id.properties.setProperty("Ice.Trace.Protocol", "1");
    //id.properties.setProperty("Ice.Trace.Network", "3");

    return Ice.Promise.try(
        function()
        {
            if(typeof(_runServer) === "undefined")
            {
                return _test(out, id);
            }

            communicator = Ice.initialize();
            var str = "controller:" + protocol + " -h " + host + " -p " + port;
            var controller = Test.Common.ControllerPrx.uncheckedCast(communicator.stringToProxy(str));
            if(testcases === undefined)
            {
                testcases = [ { name: "client/server" } ];
            }

            var run = function(testcase, client)
            {
                if(testcase.langs && testcase.langs.indexOf(language) == -1)
                {
                    return;
                }

                var runTestCase;
                out.writeLine("[ running " + testcase.name + " test]");
                if(language === "js")
                {
                    runTestCase = function() { return controller.runTestCase("cpp", "Ice/echo", "server", ""); };
                }
                else
                {
                    runTestCase = function() { return controller.runTestCase("js", testsuite, testcase.name, language); };
                }
                out.write("starting server side... ");
                var serverTestCase;
                var server;
                return runTestCase().then(
                    function(proxy)
                    {
                        proxy = controller.ice_getCachedConnection().createProxy(proxy.ice_getIdentity());
                        serverTestCase = Test.Common.TestCasePrx.uncheckedCast(proxy);
                        var config = new Test.Common.Config();
                        config.protocol = protocol;
                        return serverTestCase.startServerSide(config);
                    }
                ).then(
                    function()
                    {
                        out.writeLine("ok");
                        process.argv = testcase.args;
                        if(language === "js")
                        {
                            var initData = id.clone();
                            if(testcase.args !== undefined)
                            {
                                initData.properties = Ice.createProperties(testcase.args, id.properties);
                            }
                            var ready = new Ice.Promise();
                            server = _server(out, initData.clone(), ready);
                            return ready;
                        }
                    }
                ).then(
                    function()
                    {
                        var initData = id.clone();
                        if(testcase.args !== undefined)
                        {
                            initData.properties = Ice.createProperties(testcase.args, id.properties);
                        }
                        return client(out, initData);
                    }
                ).then(
                    function()
                    {
                        if(server)
                        {
                            return server; // Wait for server to terminate
                        }
                    }
                ).then(
                    function()
                    {
                        return serverTestCase.stopServerSide(true);
                    }
                ).catch(
                    function(ex)
                    {
                        out.writeLine("failed! (" + ex + ")");
                        throw ex;
                    }
                ).finally(
                    function()
                    {
                        if(serverTestCase)
                        {
                            return serverTestCase.destroy();
                        }
                    });
            };

            var p = Ice.Promise.resolve();
            testcases.forEach(function(testcase) {
                p = p.then(function() { return run(testcase, _test); });
            });
            return p;
        }
    ).finally(
        function()
        {
            if(communicator)
            {
                return communicator.destroy();
            }
        }
    ).then(
        function()
        {
            return true;
        },
        function(ex)
        {
            out.writeLine("");
            if(ex instanceof Test.Common.TestCaseFailedException)
            {
                out.writeLine("Server test case failed to start:\n");
                out.writeLine(ex.output);
            }
            else
            {
                out.writeLine(ex.toString());
                if(ex.stack)
                {
                    out.writeLine(ex.stack);
                }
            }
            return false;
        });
}
