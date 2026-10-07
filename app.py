import streamlit as st
import openai
import re

def extract_python_code(markdown_text):
    """从 Markdown 文本中提取 Python 代码块"""
    # 使用正则表达式查找所有 Python 代码块
    pattern = r'```python\n(.*?)```'
    matches = re.findall(pattern, markdown_text, re.DOTALL)
    
    # 合并所有匹配到的代码块
    extracted_code = '\n'.join(matches)
    return extracted_code.strip()

def main():
    st.set_page_config(page_title="代码生成器", page_icon="🤖", layout="wide")
    
    st.title("🤖 AI 代码生成器")
    st.markdown("使用自然语言描述生成 Python 代码")
    
    # 侧边栏 - API Key 输入
    with st.sidebar:
        st.header("⚙️ 配置")
        api_key = st.text_input("OpenAI API Key", type="password", 
                               placeholder="请输入你的 API Key")
        
        # 模型选择
        model = st.selectbox(
            "选择模型",
            ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"],
            index=0
        )
        
        # 温度设置
        temperature = st.slider("Temperature", 0.0, 1.0, 0.7)
    
    # 主界面 - 文本输入和输出
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("📝 描述需求")
        user_input = st.text_area(
            "请描述你想要生成的代码功能：",
            height=300,
            placeholder="例如：创建一个函数来计算两个数的和..."
        )
        
        if st.button("🔄 生成代码", type="primary"):
            if not api_key:
                st.error("❌ 请在侧边栏输入 OpenAI API Key")
            elif not user_input.strip():
                st.error("❌ 请输入代码需求描述")
            else:
                try:
                    with st.spinner("🧠 正在生成代码..."):
                        # 设置 OpenAI API 密钥
                        openai.api_key = api_key
                        
                        # 创建聊天完成请求
                        response = openai.ChatCompletion.create(
                            model=model,
                            messages=[
                                {
                                    "role": "system",
                                    "content": "你是一个专业的 Python 开发者，擅长根据自然语言描述生成高质量的 Python 代码。请生成符合要求的 Python 代码，并将其放在 Markdown 代码块中。"
                                },
                                {
                                    "role": "user",
                                    "content": user_input
                                }
                            ],
                            temperature=temperature
                        )
                        
                        # 获取 AI 响应
                        ai_response = response.choices[0].message['content']
                        
                        # 提取 Python 代码
                        python_code = extract_python_code(ai_response)
                        
                        # 将响应存储在 session state 中
                        st.session_state.ai_response = ai_response
                        st.session_state.python_code = python_code
                        
                except Exception as e:
                    st.error(f"❌ 生成代码时出错：{str(e)}")
    
    with col2:
        st.subheader("📊 生成结果")
        if 'ai_response' in st.session_state:
            st.success("✅ 代码生成成功！")
            
            # 显示生成的完整响应（包括 Markdown）
            with st.expander("📋 查看完整响应"):
                st.markdown(st.session_state.ai_response)
            
            # 如果有提取的 Python 代码，显示并提供下载
            if st.session_state.python_code:
                st.info(f"📄 提取到 {len(st.session_state.python_code.splitlines())} 行 Python 代码")
                
                # 显示提取的代码
                st.code(st.session_state.python_code, language='python')
                
                # 提供下载按钮
                st.download_button(
                    label="📥 下载 .py 文件",
                    data=st.session_state.python_code,
                    file_name="generated_code.py",
                    mime="text/x-python"
                )
            else:
                st.warning("⚠️ 未检测到 Python 代码块，请检查 AI 生成的内容")
        else:
            st.info("💡 点击左侧按钮开始生成代码")

if __name__ == "__main__":
    main()
