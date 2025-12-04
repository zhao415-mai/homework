/*******************生成立方体纹理对象*******************************/
function configureCubeMap(program) {
	gl.activeTexture(gl.TEXTURE0);

    cubeMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeMap);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.uniform1i(gl.getUniformLocation(program, "cubeSampler"), 0);

	var faces = [
	    ["./skybox/right.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_X],
        ["./skybox/left.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_X],
        ["./skybox/top.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_Y],
        ["./skybox/bottom.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_Y],
        ["./skybox/front.jpg", gl.TEXTURE_CUBE_MAP_POSITIVE_Z],
        ["./skybox/back.jpg", gl.TEXTURE_CUBE_MAP_NEGATIVE_Z]
		];
    
    for (var i = 0; i < 6; i++) {
        var face = faces[i][1];
        var image = new Image();
        image.src = faces[i][0];
        image.onload = function (cubeMap, face, image) {
            return function () {
		        gl.texImage2D(face, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            }
        }(cubeMap, face, image);
    }
}

/*TODO1:创建一般2D颜色纹理对象并加载图片*/
function configureTexture(image) {
    var texture = gl.createTexture();
    
     // 绑定2D纹理
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // 设置纹理过滤参数
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    
    // 设置纹理环绕方式
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    
    // 处理图片加载
    image.onload = function() {
        // 重新绑定纹理（确保上下文正确）
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // 翻转Y轴（图片坐标系与WebGL纹理坐标系Y轴方向相反）
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        // 加载纹理数据
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        // 生成MIP映射
        gl.generateMipmap(gl.TEXTURE_2D);
    };
    
    // 初始设置一个空白纹理（避免加载前报错）
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    
    return texture;
}