import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";

interface InputFormProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  context?: 'homepage' | 'chat';
}

type ResearchType = 'general' | 'macro' | 'equity';

const RESEARCH_TYPE_LABELS: Record<ResearchType, string> = {
  general: '通用研究',
  macro: '宏观政策',
  equity: '个股分析',
};

export function InputForm({ onSubmit, isLoading, context = 'homepage' }: InputFormProps) {
  const [inputValue, setInputValue] = useState("");
  const [ticker, setTicker] = useState("");
  const [researchType, setResearchType] = useState<ResearchType>('general');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const buildQuery = (): string => {
    const query = inputValue.trim();
    const prefixes: string[] = [];

    if (ticker.trim()) {
      prefixes.push(`[TICKER: ${ticker.trim().toUpperCase()}]`);
    }
    if (researchType !== 'general') {
      prefixes.push(`[RESEARCH_TYPE: ${researchType}]`);
    }

    return prefixes.length > 0 ? `${prefixes.join(' ')} ${query}` : query;
  };

  const submitQuery = () => {
    const query = buildQuery();
    if (query && !isLoading) {
      onSubmit(query);
      setInputValue("");
      setTicker("");
      setResearchType('general');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitQuery();
    }
  };

  const placeholderText =
    context === 'chat'
      ? "回复 Agent，调整计划，或输入 'Looks good' 确认..."
      : "输入投资研究主题，例如：美联储加息对科技股的影响";

  if (context === 'chat') {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-end space-x-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            className="flex-1 resize-none pr-10 min-h-[40px]"
          />
          <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="股票代码（可选，如 NVDA）"
          className="w-44 text-sm bg-white border-gray-300 placeholder:text-gray-400 text-gray-900"
          maxLength={10}
        />
        <Select
          value={researchType}
          onValueChange={(v) => setResearchType(v as ResearchType)}
        >
          <SelectTrigger className="flex-1 bg-white border-gray-300 text-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-gray-200">
            {(Object.keys(RESEARCH_TYPE_LABELS) as ResearchType[]).map((key) => (
              <SelectItem key={key} value={key} className="text-gray-700 focus:bg-gray-100">
                {RESEARCH_TYPE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end space-x-2">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          rows={2}
          className="flex-1 resize-none min-h-[56px]"
        />
        <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </form>
  );
}
