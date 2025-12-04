#version 300 es
precision mediump float;

out vec4 FragColor;

uniform float ambientStrength, specularStrength, diffuseStrength,shininess;

in vec3 Normal;//法向量
in vec3 FragPos;//相机观察的片元位置
in vec2 TexCoord;//纹理坐标
in vec4 FragPosLightSpace;//光源观察的片元位置

uniform vec3 viewPos;//相机位置
uniform vec4 u_lightPosition; //光源位置	
uniform vec3 lightColor;//入射光颜色

uniform sampler2D diffuseTexture;
uniform sampler2D depthTexture;
uniform samplerCube cubeSampler;//盒子纹理采样器


float shadowCalculation(vec4 fragPosLightSpace, vec3 normal, vec3 lightDir)
{
    float shadow=0.0;  //非阴影
    /*TODO3: 添加阴影计算，返回1表示是阴影，返回0表示非阴影*/
    
     // 步骤1：将齐次坐标转换为标准化设备坐标（NDC）
    vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;

    // 步骤2：将NDC坐标（[-1,1]）转换为纹理坐标（[0,1]）
    projCoords = projCoords * 0.5 + 0.5;

    // 步骤3：获取光源视角下的最近深度值
    float closestDepth = texture(depthTexture, projCoords.xy).r;

    // 步骤4：获取当前片段在光源视角下的深度值
    float currentDepth = projCoords.z;

    // 步骤5：计算偏差（解决阴影 acne 问题）
    float bias = max(0.005 * (1.0 - dot(normal, lightDir)), 0.001);

    // 步骤6：判断是否在阴影中（当前深度 > 最近深度 + 偏差 → 被遮挡）
    shadow = (currentDepth - bias > closestDepth) ? 1.0 : 0.0;

    // 步骤7：超出光源视锥体范围的片段不计算阴影
    if (projCoords.z > 1.0) {
        shadow = 0.0;
    }
    return shadow;
   
}       

void main()
{
    
    //采样纹理颜色
    vec3 TextureColor = texture(diffuseTexture, TexCoord).xyz;

    //计算光照颜色
 	vec3 norm = normalize(Normal);
	vec3 lightDir;
	if(u_lightPosition.w==1.0) 
        lightDir = normalize(u_lightPosition.xyz - FragPos);
	else lightDir = normalize(u_lightPosition.xyz);
	vec3 viewDir = normalize(viewPos - FragPos);
	vec3 halfDir = normalize(viewDir + lightDir);


    /*TODO2:根据phong shading方法计算ambient,diffuse,specular*/
    
    vec3 ambient = ambientStrength * lightColor;

    // 漫反射（与法向量和光线方向夹角相关）
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 diffuse = diffuseStrength * diff * lightColor;

    // 镜面反射（与反射光和视线方向夹角相关）
    vec3 reflectDir = reflect(-lightDir, norm);  // 反射光线方向
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
    vec3 specular = specularStrength * spec * lightColor;

  	vec3 lightReflectColor=(ambient +diffuse + specular);

    //判定是否阴影，并对各种颜色进行混合
    float shadow = shadowCalculation(FragPosLightSpace, norm, lightDir);
	
    //vec3 resultColor =(ambient + (1.0-shadow) * (diffuse + specular))* TextureColor;
    vec3 resultColor=(1.0-shadow/2.0)* lightReflectColor * TextureColor;
    
    FragColor = vec4(resultColor, 1.f);
}


