/*
 * https://github.com/netnr/workers
 *
 * 2019-10-12 - 2022-01-17
 * netnr
 */

addEventListener('fetch', event => {
    event.passThroughOnException()

    event.respondWith(handleRequest(event))
})

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(event) {
    const { request } = event;

    //请求头部、返回对象
    let reqHeaders = new Headers(request.headers),
        outBody, outStatus = 200, outStatusText = 'OK', outCt = null, outHeaders = new Headers({
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": reqHeaders.get('Access-Control-Allow-Headers') || "Accept, Authorization, Cache-Control, Content-Type, DNT, If-Modified-Since, Keep-Alive, Origin, User-Agent, X-Requested-With, Token, x-access-token"
        });

    try {
        //取域名第一个斜杠后的所有信息为代理链接
        let url = request.url.substr(8);
        url = decodeURIComponent(url.substr(url.indexOf('/') + 1));

        //需要忽略的代理
        if (request.method == "OPTIONS" || url.length < 3 || url.indexOf('.') == -1 || url == "favicon.ico" || url == "robots.txt") {
            //输出提示
            const invalid = !(request.method == "OPTIONS" || url.length === 0)
            outBody = JSON.stringify({
                code: invalid ? 400 : 0,
                usage: 'Host/{URL}',
                source: 'https://github.com/netnr/workers'
            });
            outCt = "application/json";
            outStatus = invalid ? 400 : 200;
        }
        //阻断
        else if (blocker.check(url)) {
            outBody = JSON.stringify({
                code: 403,
                msg: 'The keyword: ' + blocker.keys.join(' , ') + ' was blocklisted by the operator of this proxy.'
            });
            outCt = "application/json";
            outStatus = 403;
        }
        else {
            url = fixUrl(url);

            //构建 fetch 参数
            let fp = {
                method: request.method,
                headers: {}
            }

            //保留头部其它信息
            let he = reqHeaders.entries();
            for (let h of he) {
                if (!['content-length', 'content-type', 'host'].includes(h[0])) {
                    fp.headers[h[0]] = h[1];
                }
            }

            // 是否带 body
            if (["POST", "PUT", "PATCH", "DELETE"].indexOf(request.method) >= 0) {
                const ct = (reqHeaders.get('content-type') || "").toLowerCase();
                if (ct.includes('application/json')) {
                    fp.body = JSON.stringify(await request.json());
                } else if (ct.includes('application/text') || ct.includes('text/html')) {
                    fp.body = await request.text();
                } else if (ct.includes('form')) {
                    fp.body = await request.formData();
                } else {
                    fp.body = await request.blob();
                }
            }

            // 发起 fetch
            let fr = (await fetch(url, fp));
            outCt = fr.headers.get('content-type');
            outStatus = fr.status;
            outStatusText = fr.statusText;
            outBody = fr.body;
        }
    } catch (err) {
        outCt = "application/json";
        outBody = JSON.stringify({
            code: -1,
            msg: JSON.stringify(err.stack) || err
        });
        outStatus = 500;
    }

    //设置类型
    if (outCt && outCt != "") {
        outHeaders.set("content-type", outCt);
    }

    let response = new Response(outBody, {
        status: outStatus,
        statusText: outStatusText,
        headers: outHeaders
    })

    //日志接口（申请自己的应用修改密钥后可取消注释）
    sematext.add(event, request, response);

    return response;

    // return new Response('OK', { status: 200 })
}

// 补齐 url
function fixUrl(url) {
    if (url.includes("://")) {
        return url;
    } else if (url.includes(':/')) {
        return url.replace(':/', '://');
    } else {
        return "http://" + url;
    }
}

/**
 * 阻断器
 */
const blocker = {
    keys: [".m3u8", ".ts", ".acc", ".m4s", "photocall.tv", "googlevideo.com", "liveradio.ie"],
    check: function (url) {
        url = url.toLowerCase();
        let len = blocker.keys.filter(x => url.includes(x)).length;
        return len != 0;
    }
}

/**
 * 日志
 */
const sematext = {

    // 从 https://sematext.com/ 申请并修改密钥
    token: "d6945da2-06af-46a3-b394-b862e44ac537",

    /**
     * 头转object
     * @param {any} headers
     */
    headersToObj: headers => {
        const obj = {}
        Array.from(headers).forEach(([key, value]) => {
            obj[key.replace(/-/g, "_")] = value
        })
        return obj
    },

    /**
     * 构建发送主体
     * @param {any} request
     * @param {any} response
     */
    buildBody: (request, response) => {
        const hua = request.headers.get("user-agent")
        const hip = request.headers.get("cf-connecting-ip")
        const hrf = request.headers.get("referer")
        const url = new URL(request.url)

        const body = {
            method: request.method,
            statusCode: response.status,
            clientIp: hip,
            referer: hrf,
            userAgent: hua,
            host: url.host,
            path: url.pathname,
            proxyHost: null,
        }

        if (body.path.includes(".") && body.path != "/" && !body.path.includes("favicon.ico")) {
            try {
                let purl = fixUrl(decodeURIComponent(body.path.substring(1)));

                body.path = purl;
                body.proxyHost = new URL(purl).host;
            } catch { }
        }

        return {
            method: "POST",
            body: JSON.stringify(body)
        }
    },

    /**
     * 添加
     * @param {any} event
     * @param {any} request
     * @param {any} response
     */
    add: (event, request, response) => {
        let url = `https://logsene-receiver.sematext.com/${sematext.token}/example/`;
        const body = sematext.buildBody(request, response);

        event.waitUntil(fetch(url, body))
    }
};
