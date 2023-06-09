subassemblies = [];
elements = [];
global_id = 0;
shader_program = null;
active_element = null;

fragment_source_stub = `
#define MAX_ITERATIONS 200
#define EPSILON 0.001

precision highp float;
varying vec2 uv;
uniform vec2 resolution;

`;

fragment_source_end = `

void get_camera_ray(vec2 pixel, out vec3 pos, out vec3 direction){
	float least_side;
	
	pixel -= vec2(0.5);
	least_side = min(resolution.x, resolution.y);
	pos = vec3(0.0);
	direction = normalize(vec3(pixel.x*resolution.x/least_side, pixel.y*resolution.y/least_side, 1.0));
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
    return mix(a, b, h) - k*h*(1.0-h);
}

//float sdf(vec3 pos){
	//float s0;
	//float s1;

	//pos -= vec3(-1.75, 0.0, 0.0);
	//s0 = length(pos - vec3(0.0, 0.0, 4.0)) - 1.0;
	//s1 = length(pos - vec3(0.71, 0.0, 4.0)) - 0.75;

	//return smin(s0, s1, 0.05);
//}

float min_dist_raymarch(vec3 pos, vec3 direction, out vec3 intersect_pos){
    float dist;
    float min_dist = 1000.0;

    for(int i = 0; i < MAX_ITERATIONS; i++){
        dist = SDF(pos);
        min_dist = min(dist, min_dist);
        if(dist < EPSILON)
            break;
        pos += direction*dist;
    }

    intersect_pos = pos;

    return min_dist;
}

vec3 surface_normal(vec3 p){
    float d;
        
    d = SDF(p);
    return normalize(vec3(
        SDF(p + vec3(EPSILON, 0.0, 0.0)) - d,
        SDF(p + vec3(0.0, EPSILON, 0.0)) - d,
        SDF(p + vec3(0.0, 0.0, EPSILON)) - d));
}

void main(){
	vec3 pos;
	vec3 direction;
	vec3 intersect_pos;
	vec3 shadow_pos;
	vec3 normal;
	vec3 light_direc = normalize(vec3(1.0, 0.0, -0.8));

	get_camera_ray(uv, pos, direction);

	if(min_dist_raymarch(pos, direction, intersect_pos) < EPSILON){
		normal = surface_normal(intersect_pos);
		//light_direction*EPSILON*2.0/dot(light_direction, norm)
		intersect_pos += light_direc*EPSILON/dot(light_direc, normal);
		if(min_dist_raymarch(intersect_pos, light_direc, shadow_pos) > EPSILON){
			gl_FragColor = vec4(mix(vec3(0.1), vec3(1.0), dot(normal, light_direc)), 1.0);
		} else {
			gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
		}
	} else {
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
	}
}
`;

vertex_source = `
attribute vec4 pos;
varying vec2 uv;

void main(){
	uv = vec2(pos.x, 1.0 - pos.y);
	gl_Position = pos*2.0 - vec4(1.0);
}
`;

function load_shader(gl, type, source){
	var shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
		console.log(source);
		console.log("An error occurred while compiling a shader: " + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}

	return shader;
}

function init_shaders(gl, vertex_source, fragment_source){
	vertex_shader = load_shader(gl, gl.VERTEX_SHADER, vertex_source);
	fragment_shader = load_shader(gl, gl.FRAGMENT_SHADER, fragment_source);

	var shader_program = gl.createProgram();
	gl.attachShader(shader_program, vertex_shader);
	gl.attachShader(shader_program, fragment_shader);
	gl.linkProgram(shader_program);

	if(!gl.getProgramParameter(shader_program, gl.LINK_STATUS)){
		console.log("Unable to link the shader program: " + gl.getProgramInfoLog(shader_program));
		return null;
	}

	return shader_program;
}

function initialize_canvas(){
	canvas = document.getElementById("glcanvas");
	canvas.width = canvas.getBoundingClientRect().width;
	canvas.height = canvas.getBoundingClientRect().height;
	gl = canvas.getContext("webgl");
	if(!gl){
		alert("Your browser does not support webgl.");
		return;
	}
}

function initialize(){
	subassemblies.push(new Subassembly("SDF"));
	subassemblies[0].children.push(new Sphere(0, 0, 4, 1, subassemblies[0]));
	active_element = subassemblies[0];
	render_options();

	initialize_canvas();
	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clearDepth(1.0);
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	recompile_shaders();
}

function recompile_shaders(){
	var fragment_source = fragment_source_stub + compile_all() + fragment_source_end;
	var new_program = init_shaders(gl, vertex_source, fragment_source);
	gl.useProgram(new_program);
	shader_program = new_program;

	vertices = new Float32Array([0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0]);
	vertex_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
	pos = gl.getAttribLocation(shader_program, "pos");
	gl.vertexAttribPointer(pos, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(pos);
	res = gl.getUniformLocation(shader_program, "resolution");
	gl.uniform2f(res, canvas.width, canvas.height);
}

function render(){
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function delete_element(element){
	if((element.container && element.children.length > 0) || element.id == 0){
		return;
	}

	for(var i = element.id + 1; i < global_id; i++){
		elements[i].id--;
	}
	elements.splice(element.id, 1);
	global_id--;

	element.parent_element.children.splice(element.parent_element.children.indexOf(element), 1);

	render_options();
	if(element.parent_element.children.length == 0){
		var selected_element = element.parent_element;
	} else {
		var selected_element = element.parent_element.children[element.parent_element.children.length - 1];
	}
	document.getElementById("elements_menu").value = selected_element.id;
	update_menu(selected_element);
	recompile_shaders();
	render();
}

function add_element(element_name){
	var parent_element = active_element;
	var new_element;

	while(!parent_element.container){
		parent_element = parent_element.parent_element;
	}

	if(element_name == "sphere"){
		new_element = new Sphere(0, 0, 4, 1, parent_element);
		parent_element.children.push(new_element);
	} else if(element_name == "box"){
		new_element = new Box(0, 0, 4, 1, 1, 1, parent_element);
		parent_element.children.push(new_element);
	} else if(element_name == "union"){
		new_element = new Union(parent_element);
		parent_element.children.push(new_element);
	} else if(element_name == "intersection"){
		new_element = new Intersection(parent_element);
		parent_element.children.push(new_element);
	}
	render_options();
	document.getElementById("elements_menu").value = new_element.id;
	update_menu(new_element);
	recompile_shaders();
	render();
}

function main(){
	initialize();
	render();
}

function Subassembly(name, parent_element){
	this.children = [];
	this.name = name;
	this.parent_element = null;
	this.container = true;
	this.type = "subassembly";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function SubassemblyInstance(name, parent_element){
	this.container = false;
	this.name = name;
	this.parent_element = parent_element;
	this.type = "subassembly_instance";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function Sphere(x, y, z, r, parent_element){
	this.x = x;
	this.y = y;
	this.z = z;
	this.r = r;
	this.parent_element = parent_element;
	this.container = false;
	this.type = "sphere";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function Box(x, y, z, w, h, d, parent_element){
	this.x = x;
	this.y = y;
	this.z = z;
	this.w = w;
	this.h = h;
	this.d = d;
	this.parent_element = parent_element;
	this.container = false;
	this.type = "box";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function Union(parent_element){
	this.parent_element = parent_element;
	this.children = [];
	this.container = true;
	this.type = "union";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function Intersection(parent_element){
	this.parent_element = parent_element;
	this.children = [];
	this.container = true;
	this.type = "intersection";
	this.id = global_id;
	elements[this.id] = this;
	global_id++;
}

function render_options(){
	var output = "";

	for(var i = 0; i < subassemblies.length; i++){
		output += render_option_subassembly(subassemblies[i]);
	}

	document.getElementById("elements_menu").innerHTML = output;
}

function render_option_subassembly(subassembly){
	var output = "<option value = \"" + subassembly.id + "\">" + subassembly.name + "</option>";

	for(var i = 0; i < subassembly.children.length; i++){
		output += render_option(1, subassembly.children[i]);
	}

	return output;
}

function render_option(tabs, element){
	var prefix = "|&nbsp&nbsp&nbsp&nbsp".repeat(tabs);
	var output = "<option value = \"" + element.id + "\">" + prefix + element.type + "</option>";

	if(element.container){
		for(var i = 0; i < element.children.length; i++){
			output += render_option(tabs + 1, element.children[i]);
		}
	}

	return output;
}

function update_menu(element){
	active_element = element;
	menus = document.getElementsByClassName("menu");
	for(var i = 0; i < menus.length; i++){
		menus[i].style.display = "none";
	}

	if(element.type == "sphere"){
		document.getElementById("sphere_radius_slider").value = active_element.r;
		document.getElementById("sphere_radius_input").value = active_element.r;
		document.getElementById("sphere_x_slider").value = active_element.x;
		document.getElementById("sphere_x_input").value = active_element.x;
		document.getElementById("sphere_y_slider").value = active_element.y;
		document.getElementById("sphere_y_input").value = active_element.y;
		document.getElementById("sphere_z_slider").value = active_element.z;
		document.getElementById("sphere_z_input").value = active_element.z;
		document.getElementById("sphere_menu").style.display = "block";
	} else if(element.type == "box"){
		document.getElementById("box_width_slider").value = active_element.w;
		document.getElementById("box_width_input").value = active_element.w;
		document.getElementById("box_height_slider").value = active_element.h;
		document.getElementById("box_height_input").value = active_element.h;
		document.getElementById("box_depth_slider").value = active_element.d;
		document.getElementById("box_depth_input").value = active_element.d;
		document.getElementById("box_x_slider").value = active_element.x;
		document.getElementById("box_x_input").value = active_element.x;
		document.getElementById("box_y_slider").value = active_element.y;
		document.getElementById("box_y_input").value = active_element.y;
		document.getElementById("box_z_slider").value = active_element.z;
		document.getElementById("box_z_input").value = active_element.z;
		document.getElementById("box_menu").style.display = "block";
	}
}

function tool_select(select_id){
	var selected_element = elements[parseInt(document.getElementById("elements_menu").childNodes[select_id].value)];
	update_menu(selected_element);
}

function compile_all(){
	var output = "";

	for(var i = 0; i < subassemblies.length; i++){
		output += compile_subassembly(subassemblies[i]);
	}

	return output;
}

function compile_subassembly(subassembly){
	var output = `
	float ${subassembly.name}(vec3 p){
	float d = 1000.0;
	`;

	for(var i = 0; i < subassembly.children.length; i++){
		output += `d = min(d, ${compile_element(subassembly.children[i])});\n`;
	}

	output += `
	return d;
	}
	`;

	return output;
}

function num_flt_str(num){
	if(Number.isInteger(num)){
		return num + ".0";
	} else {
		return num.toString();
	}
}

function compile_element(element){
	if(element.type == "sphere"){
		return `(length(p - vec3(${num_flt_str(element.x)}, ${num_flt_str(element.y)}, ${num_flt_str(element.z)})) - ${num_flt_str(element.r)})`;
	} else if(element.type == "box"){
		return `length(vec3(max(0.0, abs(p.x - ${num_flt_str(element.x)}) - ${num_flt_str(element.w/2)}), max(0.0, abs(p.y - ${num_flt_str(element.y)}) - ${num_flt_str(element.h/2)}), max(0.0, abs(p.z - ${num_flt_str(element.z)}) - ${num_flt_str(element.d/2)}))) + min(0.0, max(max(abs(p.x - ${num_flt_str(element.x)}) - ${num_flt_str(element.w/2)}, abs(p.y - ${num_flt_str(element.y)}) - ${num_flt_str(element.h/2)}), abs(p.z - ${num_flt_str(element.z)}) - ${num_flt_str(element.d/2)}))`;
	} else if(element.type == "union" && element.children.length > 1){
		var output = "";

		for(var i = 0; i < element.children.length - 1; i++){
			output += `min(${compile_element(element.children[i])}, `;
		}

		output += compile_element(element.children[element.children.length - 1]) + ")".repeat(element.children.length - 1);

		return output;
	} else if(element.type == "union" && element.children.length == 1){
		return compile_element(element.children[0]);
	} else if(element.type == "intersection" && element.children.length > 1){
		var output = "";

		for(var i = 0; i < element.children.length - 1; i++){
			output += `max(${compile_element(element.children[i])}, `;
		}

		output += compile_element(element.children[element.children.length - 1]) + ")".repeat(element.children.length - 1);
		return output;
	} else if(element.type == "intersection" && element.children.length == 1){
		return compile_element(element.children[0]);
	}

	return "1000.0";
}

main();
