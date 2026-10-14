import {onMounted, watchEffect} from "vue"
import {useSettingStore} from "@/stores/setting.ts";
import {PronunciationApi} from "@/types/types.ts";

import { SoundFileOptions } from "@/config/env.ts";

export function useSound(audioSrcList?: string[], audioFileLength?: number) {
  let audioList: HTMLAudioElement[] = $ref([])
  let audioLength = $ref(1)
  let index = $ref(0)

  onMounted(() => {
    if (audioSrcList) setAudio(audioSrcList, audioFileLength)
  })

  function setAudio(audioSrcList2: string[], audioFileLength2?: number) {
    if (audioFileLength2) audioLength = audioFileLength2
    audioList = []
    for (let i = 0; i < audioLength; i++) {
      audioSrcList2.map(src => audioList.push(new Audio(src)))
    }
    index = 0
  }

  function play(volume: number = 100) {
    index++
    if (audioList.length > 1 && audioList.length !== audioLength) {
      audioList[index % audioList.length].volume = volume / 100
      audioList[index % audioList.length].play()
    } else {
      audioList[index % audioLength].volume = volume / 100
      audioList[index % audioLength].play()
    }
  }

  return {play, setAudio}
}


export function usePlayKeyboardAudio() {
  const settingStore = useSettingStore()
  const {play, setAudio} = useSound()

  watchEffect(() => {
    if (!SoundFileOptions.find(v => v.label === settingStore.keyboardSoundFile)) {
      settingStore.keyboardSoundFile = '机械键盘2'
    }
    let urlList = getAudioFileUrl(settingStore.keyboardSoundFile)
    setAudio(urlList, urlList.length === 1 ? 3 : 1)
  })

  function playAudio() {
    if (settingStore.keyboardSound) {
      play(settingStore.keyboardSoundVolume)
    }
  }

  return playAudio
}

export function usePlayBeep() {
  const settingStore = useSettingStore()
  const {play} = useSound([`sound/beep.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

export function usePlayCorrect() {
  const settingStore = useSettingStore()
  const {play} = useSound([`sound/correct.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

/**
 * 根据单词计算本地真人语音库中的音频路径。
 * 语音库目录结构为：<path>/<单词首字母小写>/<单词>.wav，例如 voice/a/abandon.wav、voice/b/baby.wav。
 * 注意：语音库文件名保留了原始英文大小写（如 African.wav、America.wav），
 *   因此 fileName 参数应保持与磁盘文件一致的大小写，不强制转小写。
 * path 为相对于 public 的资源目录（vite 静态资源），默认 'voice'，即项目 public/voice 目录。
 * 返回的路径可直接给 <audio> / new Audio() 使用。
 * @param word 英文单词（文件名使用此参数的原始大小写）
 * @param path 语音库目录（相对于 public），默认 'voice'
 * @param soundType 'us' 美音 / 'uk' 英音（本地语音库无区分时两者走同一文件）
 */
export function getLocalWordAudioPath(word: string, path: string = 'voice', soundType?: string) {
  const trimmedWord = (word || '').trim()
  if (!trimmedWord) return ''
  // 目录用首字母小写，文件名保留传入的原始大小写
  const firstLetter = trimmedWord[0].toLowerCase()
  // 仅支持 a-z 开头的单词，其它字符（数字、符号、中文等）视为无本地语音
  if (!/^[a-z]$/.test(firstLetter)) return ''
  // BASE_URL 可能是 '/type-words'（无尾斜杠）或 '/'（根路径），去掉尾斜杠后与 path 用 '/' 连接，避免拼成 '/type-wordsvoice'
  const base = `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/${path.replace(/^\/+|\/+$/g, '')}`
  // 当前语音库无 us/uk 区分，统一用 <单词>.wav；若以后本地有 us/uk 区分文件可在此扩展
  return `${base}/${firstLetter}/${trimmedWord}.wav`
}

/**
 * 播放单词发音。
 *
 * - 当"真人发音引擎"关闭时（realSoundEnabled = false）：使用有道在线发音。
 * - 当"真人发音引擎"开启时（realSoundEnabled = true）：
 *   1. 优先播放本地 voice 语音库中的真人发音；
 *   2. 本地找不到音频文件时，使用系统 TTS（speechSynthesis）合成语音。
 *
 * 注意：语音库文件名保留了原始英文大小写（如 African.wav、America.wav），
 *   但词典中单词通常为小写。因此依次尝试「全小写」和「首字母大写」两种文件名。
 *   另外Vite 开发服务器在找不到 public 下的文件时会返回 index.html（200, text/html），
 *   导致 Audio.onerror 不触发，因此用 fetch HEAD 校验 Content-Type 是否为音频。
 */
export function usePlayWordAudio() {
  const settingStore = useSettingStore()
  const audio = $ref(new Audio())

  /**
   * 使用系统 TTS（speechSynthesis）合成并播放英文单词发音。
   * 根据 soundType 选择 en-US（美音）或 en-GB（英音）。
   */
  function playTTS(word: string) {
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.lang = settingStore.soundType === 'uk' ? 'en-GB' : 'en-US'
    utterance.rate = settingStore.wordSoundSpeed || 1
    window.speechSynthesis.cancel() // 取消上一条，避免排队
    window.speechSynthesis.speak(utterance)
  }

  async function playAudio(word: string) {
    // 开启真人发音引擎：优先播放本地语音库，找不到则用系统 TTS
    if (settingStore.realSoundEnabled) {
      const trimmed = (word || '').trim()
      const lowerWord = trimmed.toLowerCase()
      const capWord = lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1)
      const voicePath = settingStore.realSoundPath || 'voice'

      // 依次尝试：全小写（常见词 abandon.wav）→ 首字母大写（专有名词 African.wav）
      const candidates = [
        getLocalWordAudioPath(lowerWord, voicePath, settingStore.soundType),
        getLocalWordAudioPath(capWord, voicePath, settingStore.soundType),
      ].filter(Boolean)

      for (const url of candidates) {
        try {
          const resp = await fetch(url, {method: 'HEAD'})
          const ct = resp.headers.get('content-type') || ''
          if (resp.ok && ct.startsWith('audio/')) {
            audio.src = url
            audio.volume = settingStore.wordSoundVolume / 100
            audio.playbackRate = settingStore.wordSoundSpeed
            audio.play()
            return
          }
        } catch {
          // fetch 失败（网络错误等），继续尝试下一个候选或回退 TTS
        }
      }

      // 本地未找到音频文件，使用系统 TTS 合成发音
      playTTS(trimmed)
      return
    }

    // 真人发音引擎关闭：使用有道在线发音
    let url = `${PronunciationApi}${word}&type=2`
    if (settingStore.soundType === 'uk') {
      url = `${PronunciationApi}${word}&type=1`
    }
    audio.src = url
    audio.volume = settingStore.wordSoundVolume / 100
    audio.playbackRate = settingStore.wordSoundSpeed
    audio.play()
  }

  return playAudio
}

export function useTTsPlayAudio() {
  let isPlay = $ref(false)

  function play(text: string) {
    // if (isPlay) {
    //   isPlay = false
    //   return window.speechSynthesis.pause();
    // }
    let msg = new SpeechSynthesisUtterance();
    msg.text = text
    msg.rate = 1;
    msg.pitch = 1;
    // msg.lang = 'en-US';
    msg.lang = 'zh-CN';
    isPlay = true
    window.speechSynthesis.speak(msg);
    console.log('text', text)

  }

  return play
}

export function usePlayAudio(url: string) {
  new Audio(url).play().then(r => void 0)
}

export function getAudioFileUrl(name: string) {
  if (name === '机械键盘') {
    return [
      `sound/key-sounds/jixie/机械0.mp3`,
      `sound/key-sounds/jixie/机械1.mp3`,
      `sound/key-sounds/jixie/机械2.mp3`,
      `sound/key-sounds/jixie/机械3.mp3`,
    ]
  } else {
    return [`sound/key-sounds/${name}.mp3`]
  }
}
