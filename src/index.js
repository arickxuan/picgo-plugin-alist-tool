const dir = './logs'
const { time } = require('console')
const fs = require('fs')
const path = require('path')


module.exports = (ctx) => {

    const save = async (data) => {
        const filePath = path.join(dir, 'app.log')
        try {
            fs.appendFileSync(filePath, data)
        } catch (error) {
            console.log(error)
        }
    }

    const tokenOut = (lastTime) => {
        // 将时间戳转换为Date对象  
        const current = Date.now();
        const last = new Date(lastTime);


        // 计算时间差（毫秒）  
        const timeDifference = Math.abs(current - last);
        ctx.log.info(timeDifference)

        // 48小时等于2天，等于1440分钟，等于86400秒，等于86400000毫秒  
        const timeDifferenceThreshold = 86400000; // 48小时的毫秒数  

        // 比较时间差是否超过阈值  
        if (timeDifference > timeDifferenceThreshold) {
            return true; // 时间差超过48小时  
        } else {
            return false; // 时间差未超过48小时  
        }
    }
    const register = () => {
        ctx.helper.uploader.register('alist-tool', {
            handle,
            name: 'alist up',
            config: config
        })
        ctx.helper.beforeUploadPlugins.register('alist-tool', beforeUploadPlugins)
    }
    const handle = async function (ctx) {
        let userConfig = ctx.getConfig('picBed.alist-tool')
        if (!userConfig) {
            throw new Error('Can\'t find alist ar uploader config')
        }
        const url = userConfig.url
        const alistPath = userConfig.alistPath
        const paramName = userConfig.paramName
        const customHeader = userConfig.customHeader
        const customBody = userConfig.customBody
        let configToken = userConfig.configToken

        if (!configToken) {
            throw new Error('Can\'t find configToken')
        }
        let error = 0


        let imgList = ctx.output
        for (let i in imgList) {
            let image = imgList[i].buffer
            if (!image && imgList[i].base64Image) {
                image = Buffer.from(imgList[i].base64Image, 'base64')
            }
            let fileName = imgList[i].fileName
            let extension = fileName.split('.').pop(); // 获取扩展名
            let imgName = fileName.split('.')[0]; // 获取文件名
            let time = Math.floor(Date.now() / 1000);
            imgName = imgName + "_" + time + '.' + extension
            ctx.log.info(`imgName: ${imgName}`)
            const postConfig = postOptions(image, customHeader, customBody, url, paramName, imgName, alistPath, configToken)
            try {
                var body = await ctx.request(postConfig)
                let bodyJson = JSON.parse(body)
                ctx.log.info(`body: ${bodyJson.message}`)
                if (bodyJson.code !== Number(200)) {
                    error = 1
                    ctx.saveConfig({ 'picBed.alist-tool.configToken': null })
                    throw new Error(bodyJson.message)
                }
            } catch (err) {
                ctx.emit('notification', {
                    title: '上传失败',
                    body: JSON.stringify(err)
                })
            }

            delete imgList[i].base64Image
            delete imgList[i].buffer

            imgList[i]['imgUrl'] = url + "/d" + alistPath + imgName

        }
        if (error != 0) {
            imgList = []
            ctx.emit('notification', {
                title: '上传失败',
                body: '上传失败'
            })
            return
        }
        // showMsg(ctx, '上传成功', imgList[0]['imgUrl'])
    }

    const beforeUploadPlugins = {
        async handle(ctx) {
            // do something
            let userConfig = ctx.getConfig('picBed.alist-tool')
            if (!userConfig) {
                throw new Error('Can\'t find alist ar uploader config')
            }
            const url = userConfig.url
            const username = userConfig.alistUsername
            const password = userConfig.alistPassword
            const tokenDate = userConfig.tokenDate
            let configToken = userConfig.configToken

            if (tokenOut(tokenDate) || !configToken) {
                ctx.log.info('tokenDate:' + tokenDate)
                let res = await getToken(username, password, url)
                if (res.code !== Number(200)) {
                    throw new Error(res.msg)
                }
                configToken = res.data.token
                ctx.saveConfig({ 'picBed.alist-tool.configToken': configToken })
                ctx.saveConfig({ 'picBed.alist-tool.tokenDate': Date.now() })

            }
            if (!configToken) {

                ctx.emit('notification', {
                    title: ' token error',
                    body: JSON.stringify(err)
                })
                throw new Error('Can\'t find configToken')
            }
        }
    }

    const getToken = async function (username, password, url) {
        let headers = {
            // 'Content-Type': 'application/json',
            contentType: 'application/json',
        }
        const opts = {
            method: 'POST',
            url: url + '/api/auth/login',
            headers: headers,
            data: {
                Username: username,
                Password: password,
            },
            json: true,
        }
        try {
            let body = await ctx.Request.request(opts)
            return body
            // const response = await axios.post(url,JSON.stringify(formData));
        } catch (error) {
            throw new Error('network error')
        }


    }

    const postOptions = (image, customHeader, customBody, url, paramName, fileName, alistPath, token) => {
        let path = alistPath + fileName
        path = encodeURIComponent(path);
        let headers = {
            contentType: 'multipart/form-data',
            // 'User-Agent': 'PicGo',
            'Authorization': token,  //'Bearer ' +
            'File-Path': path,
        }

        if (customHeader) {
            headers = Object.assign(headers, JSON.parse(customHeader))
        }
        let formData = {}
        if (customBody) {
            formData = Object.assign(formData, JSON.parse(customBody))
        }
        let postUrl = url + '/api/fs/form'
        const opts = {
            method: 'PUT',
            url: postUrl,
            headers: headers,
            formData: formData
        }
        opts.formData[paramName] = {}
        opts.formData[paramName].value = image
        opts.formData[paramName].options = {
            filename: fileName
        }
        return opts
    }

    const showMsg = (ctx, title, body) => {
        return [
            {
                label: '显示通知',
                async handle(ctx, guiApi) {
                    guiApi.showNotification({
                        title: title,
                        body: body,
                        text: body,
                    })
                }
            }
        ]
    }

    const config = ctx => {
        let userConfig = ctx.getConfig('picBed.alist-tool')
        if (!userConfig) {
            userConfig = {}
        }
        return [
            {
                name: 'url',
                type: 'input',
                default: userConfig.url,
                required: true,
                message: 'API地址',
                alias: 'API地址'
            },
            {
                name: 'paramName',
                type: 'input',
                default: userConfig.paramName,
                required: true,
                message: 'POST file 参数名',
                alias: 'POST参数名'
            },
            {
                name: 'alistUsername',
                type: 'input',
                default: userConfig.alistUsername,
                required: true,
                message: 'username',
                alias: 'alist username'
            },
            {
                name: 'alistPassword',
                type: 'password',
                default: userConfig.alistPassword,
                required: true,
                message: 'password',
                alias: ' alist password'
            },
            {
                name: 'alistPath',
                type: 'input',
                default: userConfig.alistPath,
                required: true,
                message: 'alist path (eg: /img/)',
                alias: 'uri '
            },
            {
                name: 'tokenDate',
                type: 'input',
                default: userConfig.tokenDate || 0,
                required: false,
                message: '无视即可 自动更新',
                alias: 'token更新时间'
            },
            {
                name: 'configToken',
                type: 'input',
                default: userConfig.configToken,
                required: false,
                message: '无视即可 自动更新',
                alias: 'alist token'
            },
            {
                name: 'fileRename',
                type: 'confirm',
                default: userConfig.fileRename || false,
                required: false,
                message: '文件名是否加时间戳',
                alias: 'alist fileRename'
            },
            {
                name: 'customHeader',
                type: 'input',
                default: userConfig.customHeader,
                required: false,
                message: '自定义请求头 标准JSON(eg: {"key":"value"})',
                alias: '自定义请求头'
            },
            {
                name: 'customBody',
                type: 'input',
                default: userConfig.customBody,
                required: false,
                message: '自定义Body 标准JSON(eg: {"key":"value"})',
                alias: '自定义Body'
            }
        ]
    }
    return {
        uploader: 'alist-tool',
        // transformer: 'web-uploader',
        config,
        register

    }
}