"""categories.yaml(상위 분류 -> 실제 데이터 카테고리 목록)를 읽어와 매핑을 제공하는 모듈."""

import re

import yaml

# 시트 데이터와 categories.yaml 사이에서 표기가 다른 가운뎃점 변형들 (•, ㆍ, · 등).
_MIDDLE_DOT_VARIANTS = re.compile("[•ㆍ·‧]")


def _normalize_for_match(text):
    """표기 차이(가운뎃점 종류, 공백)를 무시하고 비교하기 위한 정규화."""
    text = _MIDDLE_DOT_VARIANTS.sub("•", text or "")
    return re.sub(r"\s+", "", text)


class CategoryTree:
    """상위 분류와 하위(실제 데이터) 카테고리 간 매핑을 담는다."""

    def __init__(self, yaml_path):
        with open(yaml_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        # 원본 순서를 보존한 상위 분류 -> 하위 카테고리 목록
        self.tree = {top: (subs or []) for top, subs in raw.items()}

        # 실제 데이터의 카테고리 문자열(정규화된 형태) -> 상위 분류로 역매핑
        self._sub_to_top = {}
        for top, subs in self.tree.items():
            for sub in subs:
                self._sub_to_top[_normalize_for_match(sub)] = top

    @property
    def top_categories(self):
        return list(self.tree.keys())

    def top_of(self, sub_category):
        """실제 데이터 카테고리 문자열에 해당하는 상위 분류를 반환. 매핑이 없으면 None."""
        return self._sub_to_top.get(_normalize_for_match(sub_category))

    def as_dict(self):
        return self.tree
