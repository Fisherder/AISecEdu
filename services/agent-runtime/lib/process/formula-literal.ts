import {processOperations} from './schema';

/** Read only a literal spelling of the existing expression language.
 * No eval, property access, infix JavaScript, calls to unknown functions,
 * missing delimiters or invented references are accepted. The normal schema
 * and domain checks still validate the resulting tree. */
export function parseFormulaLiteral(source:string):unknown|undefined {
  if(source.length>20000||!/^\s*(?:\{|[A-Za-z][A-Za-z0-9_-]*\s*\()/.test(source))return;
  let position=0,nodes=0;
  const space=()=>{while(/\s/.test(source[position]??'')&&position<source.length)position++;};
  const take=(token:string)=>{space();if(source[position]!==token)throw Error('Expected '+token);position++;};
  const name=()=>{space();const found=/^[A-Za-z][A-Za-z0-9_-]*/.exec(source.slice(position));
    if(!found)throw Error('Expected identifier');position+=found[0].length;return found[0];};
  function quoted(){
    space();const quote=source[position++];let result='';
    while(position<source.length){
      const char=source[position++];if(char===quote)return result;
      if(char==='\\'){
        const escaped=source[position++],simple:Record<string,string>={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'};
        if(escaped==='u'){
          const digits=source.slice(position,position+4);if(!/^[0-9a-fA-F]{4}$/.test(digits))throw Error('Invalid escape');
          result+=String.fromCharCode(parseInt(digits,16));position+=4;
        }else if(Object.hasOwn(simple,escaped))result+=simple[escaped];
        else if(['\\','/','"',"'"].includes(escaped))result+=escaped;
        else throw Error('Invalid escape');
      }else{if(char.charCodeAt(0)<32)throw Error('Invalid string');result+=char;}
    }
    throw Error('Unclosed string');
  }
  function sequence(end:string,depth:number){
    const values:unknown[]=[];space();if(source[position]===end){position++;return values;}
    while(true){values.push(read(depth+1));space();if(source[position]===end){position++;return values;}take(',');}
  }
  function read(depth=0):unknown {
    if(depth>64||++nodes>4096)throw Error('Formula too complex');space();
    const char=source[position];
    if(char==='"'||char==="'")return quoted();
    if(char==='['){position++;return sequence(']',depth);}
    if(char==='{'){
      position++;const result:Record<string,unknown>=Object.create(null);space();if(source[position]==='}'){position++;return result;}
      while(true){space();const key=['"',"'"].includes(source[position])?quoted():name();
        if(['__proto__','prototype','constructor'].includes(key)||Object.hasOwn(result,key))throw Error('Invalid key');
        take(':');space();
        // A bare identifier is a literal ref/op name in this grammar, never
        // a variable read or JavaScript expression.
        if(['input','object','op'].includes(key)&&/^[A-Za-z][A-Za-z0-9_-]*(?:\s*[,}])/.test(source.slice(position)))result[key]=name();
        else result[key]=read(depth+1);
        space();if(source[position]==='}'){position++;return result;}take(',');
      }
    }
    const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(position));
    if(number){position+=number[0].length;const value=Number(number[0]);if(!Number.isFinite(value))throw Error('Nonfinite literal');return value;}
    const word=name();if(word==='true')return true;if(word==='false')return false;if(word==='null')return null;
    if(!Object.hasOwn(processOperations,word)&&!['input','object'].includes(word))throw Error('Unknown function');
    take('(');const args=sequence(')',depth);
    if(['input','object'].includes(word)){
      if(args.length!==1||typeof args[0]!=='string')throw Error('Invalid reference');return {[word]:args[0]};
    }
    return {op:word,args};
  }
  try{const result=read();space();if(position!==source.length)return;
    if(!result||typeof result!=='object'||Array.isArray(result))return;
    return result;
  }catch{return;}
}
