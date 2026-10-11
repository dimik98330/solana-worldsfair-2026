import assert from 'node:assert/strict';
import test from 'node:test';
import {isUiLanguage, translate, uiLocale} from './i18n';

test('three persisted UI language codes have explicit supported locales',()=>{
  for(const language of ['kk','ru','en'] as const){assert.equal(isUiLanguage(language),true);assert.equal(Intl.DateTimeFormat.supportedLocalesOf([uiLocale(language)]).length,1);}
  for(const invalid of ['kz','fr','',null,{}])assert.equal(isUiLanguage(invalid),false);
  assert.equal(uiLocale('kk'),'kk-KZ');
});
test('Kazakh translates navigation, operations and signing warnings instead of falling through to English',()=>{
  for(const key of ['Overview','Language','Time zone','Principal repayment','The active wallet changed. Prepare a new preview.','No signature was returned. Read the chain state before proceeding; this operation will not be resubmitted automatically.']){
    const value=translate('kk',key);assert.notEqual(value,key);assert.match(value,/[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/);
  }
});
test('English remains source text and explicit Russian copy retains its context',()=>{
  assert.equal(translate('en','Open','Открыть'),'Open');
  assert.equal(translate('ru','Open','Открыть'),'Открыть');
  const identity='BondTrace · external issue label';
  assert.equal(translate('kk',identity),identity);
});
test('Kazakh amount hints agree with decimal-point validation',()=>{
  for(const key of ['Settlement units, up to 6 decimal places.','Up to 2 decimal places. Coupon = nominal × annual rate ÷ payments per year.']){
    assert.match(translate('kk',key),/нүктеден|Нүктеден/);
    assert.doesNotMatch(translate('kk',key),/үтірден|Үтірден/);
  }
});
